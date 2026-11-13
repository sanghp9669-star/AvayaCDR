import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { UpdateApplyResult, UpdateCheckResult, UpdateStepResult } from '../shared/cdrTypes.ts';
import { logError, logListener } from './logger.ts';

const execFileAsync = promisify(execFile);

const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const BRANCH_PATTERN = /^[a-zA-Z0-9_.\-/]+$/;

/**
 * Normalizes a GitHub repository input (either "owner/repo" or "https://github.com/owner/repo(.git)")
 * and strictly validates against SSRF / command injection.
 */
export function normalizeGitHubRepo(input: string): string {
  let clean = input.trim();
  if (!clean) return '';

  // Allow pasting https://github.com/owner/repo or git@github.com:owner/repo.git
  clean = clean
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  if (!REPO_PATTERN.test(clean) || clean.includes('..')) {
    throw new Error('Tên repository GitHub không hợp lệ (định dạng chuẩn: owner/repo).');
  }
  return clean;
}

export function validateBranchName(branch: string): string {
  const clean = branch.trim() || 'main';
  if (!BRANCH_PATTERN.test(clean) || clean.includes('..') || clean.startsWith('-')) {
    throw new Error('Tên nhánh (branch) Git không hợp lệ.');
  }
  return clean;
}

/**
 * Compares two SemVer strings (e.g. "v1.2.3" vs "1.0.0").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function readPackageVersion(cwd = process.cwd()): string {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function runSafeCommand(
  cmd: string,
  args: string[],
  cwd = process.cwd(),
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function getLocalGitInfo(cwd = process.cwd()): Promise<{
  isGitRepo: boolean;
  localCommit: string | null;
  detectedRepo: string | null;
  currentBranch: string | null;
}> {
  const gitDir = path.join(cwd, '.git');
  if (!fs.existsSync(gitDir)) {
    return {
      isGitRepo: false,
      localCommit: null,
      detectedRepo: null,
      currentBranch: null,
    };
  }

  let localCommit: string | null = null;
  let detectedRepo: string | null = null;
  let currentBranch: string | null = null;

  try {
    const { stdout } = await runSafeCommand('git', ['rev-parse', '--short', 'HEAD'], cwd, 5000);
    localCommit = stdout.trim() || null;
  } catch {
    // Ignore if no commits yet
  }

  try {
    const { stdout } = await runSafeCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd, 5000);
    currentBranch = stdout.trim() || null;
  } catch {
    // Ignore
  }

  try {
    const { stdout } = await runSafeCommand('git', ['remote', 'get-url', 'origin'], cwd, 5000);
    detectedRepo = normalizeGitHubRepo(stdout.trim());
  } catch {
    // Origin may not be a GitHub URL
  }

  return {
    isGitRepo: true,
    localCommit,
    detectedRepo,
    currentBranch,
  };
}

function buildGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'avaya-cm-cdr-monitor',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }
  return headers;
}

export async function checkGitHubUpdate(
  repoInput: string,
  branchInput = 'main'
): Promise<UpdateCheckResult> {
  const repo = normalizeGitHubRepo(repoInput);
  if (!repo) {
    throw new Error('Vui lòng cấu hình GitHub Repository (VD: owner/repo) trước khi kiểm tra.');
  }
  const branch = validateBranchName(branchInput);
  const currentVersion = readPackageVersion();
  const gitInfo = await getLocalGitInfo();
  const headers = buildGitHubHeaders();

  // 1. Try GitHub Releases API first
  const releaseApiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const releaseRes = await fetch(releaseApiUrl, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (releaseRes.ok) {
    const releaseData = (await releaseRes.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      published_at?: string;
      target_commitish?: string;
    };

    const latestVersion = (releaseData.tag_name || '').replace(/^v/i, '') || currentVersion;
    const cmp = compareSemver(latestVersion, currentVersion);

    // Fetch latest commit on branch for commit comparison as well
    let remoteCommit: string | null = null;
    try {
      const commitRes = await fetch(
        `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
        { headers, signal: AbortSignal.timeout(8000) }
      );
      if (commitRes.ok) {
        const c = (await commitRes.json()) as { sha?: string };
        remoteCommit = c.sha ? c.sha.slice(0, 7) : null;
      }
    } catch {
      // Non-fatal
    }

    return {
      repo,
      branch,
      currentVersion,
      latestVersion,
      updateAvailable: cmp > 0,
      source: 'release',
      releaseName: releaseData.name || releaseData.tag_name || null,
      releaseNotes: releaseData.body || null,
      releaseUrl: releaseData.html_url || `https://github.com/${repo}/releases`,
      publishedAt: releaseData.published_at || null,
      localCommit: gitInfo.localCommit,
      remoteCommit,
      isGitRepo: gitInfo.isGitRepo,
      checkedAt: new Date().toISOString(),
    };
  }

  if (releaseRes.status !== 404) {
    const errText = await releaseRes.text().catch(() => '');
    throw new Error(`GitHub API trả về lỗi (${releaseRes.status}): ${errText.slice(0, 160)}`);
  }

  // 2. Fallback: No GitHub Release published -> check package.json + latest commit on branch
  const [pkgRes, commitRes] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`,
      { headers, signal: AbortSignal.timeout(10000) }
    ),
    fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  if (!commitRes.ok) {
    if (commitRes.status === 404) {
      throw new Error(`Không tìm thấy repository "${repo}" hoặc nhánh "${branch}" trên GitHub.`);
    }
    throw new Error(`Không thể truy vấn GitHub (${commitRes.status}).`);
  }

  const commitData = (await commitRes.json()) as {
    sha?: string;
    html_url?: string;
    commit?: {
      message?: string;
      committer?: { date?: string };
    };
  };

  let latestVersion = currentVersion;
  if (pkgRes.ok) {
    const pkgFile = (await pkgRes.json()) as { content?: string; encoding?: string };
    if (pkgFile.content && pkgFile.encoding === 'base64') {
      const decoded = Buffer.from(pkgFile.content, 'base64').toString('utf8');
      const parsedPkg = JSON.parse(decoded) as { version?: string };
      if (parsedPkg.version) {
        latestVersion = parsedPkg.version;
      }
    }
  }

  const remoteCommit = commitData.sha ? commitData.sha.slice(0, 7) : null;
  const semverNewer = compareSemver(latestVersion, currentVersion) > 0;
  const commitDiffers =
    Boolean(gitInfo.localCommit && remoteCommit) && gitInfo.localCommit !== remoteCommit;

  return {
    repo,
    branch,
    currentVersion,
    latestVersion,
    updateAvailable: semverNewer || commitDiffers,
    source: 'package_json',
    releaseName: `Branch ${branch}${remoteCommit ? ` (${remoteCommit})` : ''}`,
    releaseNotes: commitData.commit?.message || null,
    releaseUrl: commitData.html_url || `https://github.com/${repo}`,
    publishedAt: commitData.commit?.committer?.date || null,
    localCommit: gitInfo.localCommit,
    remoteCommit,
    isGitRepo: gitInfo.isGitRepo,
    checkedAt: new Date().toISOString(),
  };
}

export async function applyGitHubUpdate(
  repoInput: string,
  branchInput = 'main'
): Promise<UpdateApplyResult> {
  const repo = normalizeGitHubRepo(repoInput);
  if (!repo) {
    throw new Error('Chưa cấu hình GitHub Repository.');
  }
  const branch = validateBranchName(branchInput);
  const cwd = process.cwd();
  const previousVersion = readPackageVersion(cwd);
  const gitInfo = await getLocalGitInfo(cwd);

  if (!gitInfo.isGitRepo) {
    throw new Error(
      'Thư mục chạy ứng dụng không phải là Git repository (.git không tồn tại). Vui lòng triển khai bằng "git clone" trên Linux server để hỗ trợ cập nhật trực tiếp từ web.'
    );
  }

  const steps: UpdateStepResult[] = [];
  const remoteUrl = `https://github.com/${repo}.git`;

  // Ensure origin or target remote points cleanly without shell interpolation
  try {
    const statusRes = await runSafeCommand('git', ['status', '--porcelain'], cwd, 10000);
    if (statusRes.stdout.trim()) {
      throw new Error(
        'Thư mục làm việc đang có thay đổi cục bộ chưa commit. Vui lòng dọn dẹp hoặc commit trước khi cập nhật.'
      );
    }
    steps.push({ step: 'Kiểm tra trạng thái Git', ok: true, output: 'Working tree clean' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: 'Kiểm tra trạng thái Git', ok: false, output: msg });
    throw new Error(msg);
  }

  // Step 1: git fetch
  try {
    const fetchRes = await runSafeCommand('git', ['fetch', remoteUrl, branch], cwd, 45000);
    steps.push({
      step: `git fetch ${repo} (${branch})`,
      ok: true,
      output: (fetchRes.stdout || fetchRes.stderr || 'Fetched latest refs').trim(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: `git fetch ${repo} (${branch})`, ok: false, output: msg });
    logError('Update git fetch failed', err);
    throw new Error(`Không thể tải mã nguồn từ GitHub: ${msg}`);
  }

  // Step 2: git merge --ff-only FETCH_HEAD
  try {
    const mergeRes = await runSafeCommand('git', ['merge', '--ff-only', 'FETCH_HEAD'], cwd, 30000);
    steps.push({
      step: 'git merge --ff-only FETCH_HEAD',
      ok: true,
      output: (mergeRes.stdout || 'Fast-forward merged').trim(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: 'git merge --ff-only FETCH_HEAD', ok: false, output: msg });
    logError('Update git merge failed', err);
    throw new Error(`Không thể fast-forward nhánh ${branch}: ${msg}`);
  }

  // Step 3: npm install --omit=dev
  try {
    const npmRes = await runSafeCommand('npm', ['install', '--omit=dev'], cwd, 120000);
    steps.push({
      step: 'npm install --omit=dev',
      ok: true,
      output: (npmRes.stdout || 'Dependencies up to date').trim().slice(-400),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: 'npm install --omit=dev', ok: false, output: msg });
    logError('Update npm install failed', err);
    throw new Error(`Cài đặt dependencies thất bại: ${msg}`);
  }

  // Step 4: npm run build
  try {
    const buildRes = await runSafeCommand('npm', ['run', 'build'], cwd, 120000);
    steps.push({
      step: 'npm run build',
      ok: true,
      output: (buildRes.stdout || 'Frontend bundle rebuilt').trim().slice(-400),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: 'npm run build', ok: false, output: msg });
    logError('Update npm run build failed', err);
    throw new Error(`Build giao diện thất bại: ${msg}`);
  }

  const newVersion = readPackageVersion(cwd);
  logListener('INFO', `System updated from ${previousVersion} to ${newVersion} (${repo}@${branch})`);

  return {
    updated: true,
    previousVersion,
    newVersion,
    restartRequired: true,
    steps,
    completedAt: new Date().toISOString(),
  };
}
