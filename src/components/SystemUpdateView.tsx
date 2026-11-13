import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  GitBranch,
  RefreshCw,
  RotateCw,
  Save,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { UpdateApplyResult, UpdateCheckResult } from '../../shared/cdrTypes';
import { useAuth } from '../context/AuthContext';
import {
  applyGitHubUpdateApi,
  checkGitHubUpdateApi,
  fetchUpdateStatus,
  restartServerApi,
  saveUpdateRepoConfig,
  type LocalUpdateStatus,
} from '../services/cdrApi';
import { formatDateTimeParts } from '../utils/formatters';

export function SystemUpdateView() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<LocalUpdateStatus | null>(null);
  const [githubRepo, setGithubRepo] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [savingRepo, setSavingRepo] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [applyResult, setApplyResult] = useState<UpdateApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingStatus(true);
    getToken()
      .then((token) => fetchUpdateStatus(token))
      .then((res) => {
        if (!mounted) return;
        setStatus(res);
        setGithubRepo(res.githubRepo || res.detectedRepo || '');
        setGithubBranch(res.githubBranch || 'main');
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin phiên bản.');
      })
      .finally(() => {
        if (mounted) setLoadingStatus(false);
      });
    return () => {
      mounted = false;
    };
  }, [getToken]);

  const handleSaveRepo = async (e: FormEvent) => {
    e.preventDefault();
    setSavingRepo(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      const saved = await saveUpdateRepoConfig(token, githubRepo, githubBranch);
      setGithubRepo(saved.githubRepo);
      setGithubBranch(saved.githubBranch);
      setNotice(`Đã lưu cấu hình GitHub repository: ${saved.githubRepo || '(Trống)'} (${saved.githubBranch}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu cấu hình GitHub.');
    } finally {
      setSavingRepo(false);
    }
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError(null);
    setNotice(null);
    setApplyResult(null);
    try {
      const token = await getToken();
      const result = await checkGitHubUpdateApi(token, githubRepo, githubBranch);
      setCheckResult(result);
      setGithubRepo(result.repo);
      setGithubBranch(result.branch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kiểm tra phiên bản trên GitHub.');
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      const result = await applyGitHubUpdateApi(token, githubRepo, githubBranch);
      setApplyResult(result);
      setStatus((prev) => (prev ? { ...prev, currentVersion: result.newVersion } : prev));
      setNotice(
        `Đã cập nhật mã nguồn lên phiên bản ${result.newVersion}. Vui lòng khởi động lại dịch vụ để nạp bản build mới.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setApplying(false);
    }
  };

  const handleRestartService = async () => {
    setRestarting(true);
    setError(null);
    try {
      const token = await getToken();
      await restartServerApi(token);
      setNotice('Đang khởi động lại máy chủ. Trang web sẽ tự tải lại sau vài giây...');
      setTimeout(() => {
        window.location.reload();
      }, 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi lệnh khởi động lại.');
      setRestarting(false);
    }
  };

  const currentVersion = checkResult?.currentVersion || status?.currentVersion || '1.0.0';
  const checkedTime = checkResult ? formatDateTimeParts(checkResult.checkedAt) : null;
  const publishedTime =
    checkResult?.publishedAt ? formatDateTimeParts(checkResult.publishedAt) : null;

  return (
    <div className="space-y-5">
      {/* Version & GitHub Repository Configuration */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Kiểm tra & Cập nhật phiên bản từ GitHub
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Đối chiếu phiên bản hiện tại với GitHub Releases hoặc nhánh chính trên repository để cập nhật trực tiếp từ giao diện web.
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">Phiên bản hiện tại</div>
            {loadingStatus ? (
              <div className="mt-1 h-6 w-20 ml-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            ) : (
              <div className="font-display text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                v{currentVersion}
                {status?.localCommit && (
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({status.localCommit})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveRepo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="update-github-repo"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                GitHub Repository (owner/repo hoặc URL)
              </label>
              <input
                id="update-github-repo"
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="VD: company-telecom/avaya-cm-cdr"
                className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
              />
            </div>

            <div>
              <label
                htmlFor="update-github-branch"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Nhánh theo dõi (Branch)
              </label>
              <div className="relative">
                <GitBranch
                  className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="update-github-branch"
                  type="text"
                  value={githubBranch}
                  onChange={(e) => setGithubBranch(e.target.value)}
                  placeholder="main"
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-8 pr-3 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {status && !status.isGitRepo ? (
                <span>
                  Môi trường hiện tại không phải bản clone từ Git (chỉ hỗ trợ kiểm tra phiên bản từ GitHub API).
                </span>
              ) : (
                <span>Sẵn sàng kéo cập nhật trực tiếp qua Git fast-forward và rebuild ứng dụng.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={savingRepo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{savingRepo ? 'Đang lưu...' : 'Lưu cấu hình Repo'}</span>
              </button>

              <button
                type="button"
                disabled={checking || !githubRepo.trim()}
                onClick={handleCheckUpdate}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{checking ? 'Đang kiểm tra GitHub...' : 'Kiểm tra phiên bản'}</span>
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
      </section>

      {/* Check Comparison Result */}
      {checkResult && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {checkResult.updateAvailable ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <ArrowUpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Có phiên bản mới trên GitHub</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Hệ thống đang ở phiên bản mới nhất</span>
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {checkResult.repo} · branch {checkResult.branch}
                {checkedTime ? ` · Kiểm tra lúc ${checkedTime.time} ${checkedTime.date}` : ''}
              </div>
            </div>

            {checkResult.releaseUrl && (
              <a
                href={checkResult.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                <span>Xem trên GitHub</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Phiên bản đang chạy</div>
              <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
                v{checkResult.currentVersion}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Commit: {checkResult.localCommit || 'N/A'}
              </div>
            </div>

            <div className="p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Phiên bản mới nhất trên GitHub
              </div>
              <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
                v{checkResult.latestVersion}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Commit: {checkResult.remoteCommit || 'N/A'}
              </div>
            </div>

            <div className="p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Nguồn phát hành</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {checkResult.releaseName || checkResult.branch}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                {publishedTime ? `${publishedTime.date} ${publishedTime.time}` : '-'}
              </div>
            </div>
          </div>

          {checkResult.releaseNotes && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ghi chú phát hành / Commit mới nhất
              </div>
              <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                {checkResult.releaseNotes}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={applying || !checkResult.isGitRepo}
              onClick={handleApplyUpdate}
              title={
                !checkResult.isGitRepo
                  ? 'Thư mục server cần được clone từ Git để cập nhật trực tiếp'
                  : 'Kéo mã nguồn mới từ GitHub và rebuild ứng dụng'
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-40"
            >
              <DownloadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {applying
                  ? 'Đang tải & build bản mới...'
                  : checkResult.updateAvailable
                  ? 'Cập nhật trực tiếp từ GitHub'
                  : 'Đồng bộ lại từ GitHub'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Apply Execution Steps Log */}
      {applyResult && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nhật ký quá trình cập nhật (v{applyResult.previousVersion} → v{applyResult.newVersion})
              </h3>
            </div>

            {applyResult.restartRequired && (
              <button
                type="button"
                disabled={restarting}
                onClick={handleRestartService}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <RotateCw
                  className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{restarting ? 'Đang khởi động lại...' : 'Khởi động lại dịch vụ ngay'}</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {applyResult.steps.map((step, i) => (
              <div key={i} className="p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {step.step}
                  </span>
                  <span
                    className={`font-medium ${
                      step.ok
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {step.ok ? 'Thành công' : 'Thất bại'}
                  </span>
                </div>
                {step.output && (
                  <pre className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                    {step.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
