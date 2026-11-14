import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  compareSemver,
  getLocalGitInfo,
  normalizeGitHubRepo,
  parsePorcelainPaths,
  validateBranchName,
} from './updater.ts';

test('normalizeGitHubRepo accepts owner/repo and GitHub URLs while rejecting invalid inputs', () => {
  assert.equal(normalizeGitHubRepo('avaya-ops/avaya-cdr'), 'avaya-ops/avaya-cdr');
  assert.equal(
    normalizeGitHubRepo('https://github.com/avaya-ops/avaya-cdr.git'),
    'avaya-ops/avaya-cdr'
  );
  assert.equal(normalizeGitHubRepo('git@github.com:avaya-ops/avaya-cdr.git'), 'avaya-ops/avaya-cdr');
  assert.equal(normalizeGitHubRepo('  '), '');

  assert.throws(() => normalizeGitHubRepo('https://evil.example.com/foo/bar'));
  assert.throws(() => normalizeGitHubRepo('owner/repo; rm -rf /'));
  assert.throws(() => normalizeGitHubRepo('../etc/passwd'));
});

test('validateBranchName rejects unsafe git ref strings', () => {
  assert.equal(validateBranchName('main'), 'main');
  assert.equal(validateBranchName('release/v1.2'), 'release/v1.2');
  assert.throws(() => validateBranchName('--upload-pack=evil'));
  assert.throws(() => validateBranchName('main;id'));
});

test('compareSemver accurately orders semantic versions', () => {
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('v2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('v1.2.0', '1.2.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.1.0'), -1);
});

test('parsePorcelainPaths parses modified and renamed tracked file paths', () => {
  const sample = [' M package-lock.json', 'M  server/updater.ts', 'R  old.ts -> new.ts', ''].join('\n');
  assert.deepEqual(parsePorcelainPaths(sample), [
    'package-lock.json',
    'server/updater.ts',
    'new.ts',
  ]);
});

test('getLocalGitInfo ignores untracked runtime files and reports modified tracked files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avaya-updater-test-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });

    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"version":"1.0.0"}\n');
    execFileSync('git', ['add', 'package.json'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, stdio: 'ignore' });

    // Create untracked runtime files like logs/.auth-secret and .env
    fs.mkdirSync(path.join(tmpDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'logs', '.auth-secret'), 'secret-key');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'PORT=3000\n');

    const cleanInfo = await getLocalGitInfo(tmpDir);
    assert.equal(cleanInfo.isGitRepo, true);
    assert.deepEqual(cleanInfo.dirtyFiles, []);

    // Modify a tracked file
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"version":"1.0.1"}\n');
    const dirtyInfo = await getLocalGitInfo(tmpDir);
    assert.deepEqual(dirtyInfo.dirtyFiles, ['package.json']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
