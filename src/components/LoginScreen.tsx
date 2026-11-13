import { Activity, Eye, EyeOff, KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const {
    signInWithGoogle,
    signInWithLocal,
    setupLocalAdmin,
    authError,
    localSetupRequired,
    googleSigningIn,
    localSubmitting,
    clearAuthError,
  } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLocalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearAuthError();

    if (localSetupRequired) {
      if (password.length < 8) {
        setFormError('Mật khẩu quản trị phải có tối thiểu 8 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Mật khẩu xác nhận không khớp.');
        return;
      }
      try {
        await setupLocalAdmin(identifier, email, password);
      } catch {
        // Error surfaced via authError
      }
      return;
    }

    try {
      await signInWithLocal(identifier, password);
    } catch {
      // Error surfaced via authError
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shrink-0">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Avaya Aura CM CDR
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hệ thống thu nhận &amp; tra cứu nhật ký cuộc gọi qua IP
            </p>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-4">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {localSetupRequired
              ? 'Thiết lập tài khoản Quản trị viên lần đầu'
              : 'Đăng nhập quản trị viên'}
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {localSetupRequired
              ? 'Máy chủ mới triển khai chưa có tài khoản nội bộ. Hãy tạo tài khoản quản trị để đăng nhập trực tiếp trên server (hỗ trợ cả IP nội bộ và HTTPS).'
              : 'Truy cập dữ liệu CDR từ dịch vụ Listen-Only TCP Adjunct của tổng đài Avaya Communication Manager.'}
          </p>
        </div>

        {displayError && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-400">
            {displayError}
          </div>
        )}

        <form onSubmit={handleLocalSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label
              htmlFor="login-identifier"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {localSetupRequired ? 'Tên đăng nhập quản trị' : 'Tên đăng nhập hoặc Email'}
            </label>
            <input
              id="login-identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={localSetupRequired ? 'vd: admin' : 'admin hoặc email@domain'}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
            />
          </div>

          {localSetupRequired && (
            <div className="space-y-1">
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Email quản trị (tùy chọn)
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.local"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
              />
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={localSetupRequired ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={localSetupRequired ? 'Tối thiểu 8 ký tự' : 'Nhập mật khẩu'}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-3 pr-10 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {localSetupRequired && (
            <div className="space-y-1">
              <label
                htmlFor="login-confirm-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Xác nhận mật khẩu
              </label>
              <input
                id="login-confirm-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={localSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {localSetupRequired ? (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {localSubmitting
                ? 'Đang xử lý...'
                : localSetupRequired
                ? 'Tạo tài khoản Quản trị & Đăng nhập'
                : 'Đăng nhập tài khoản nội bộ'}
            </span>
          </button>
        </form>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          <span className="mx-3 text-[11px] uppercase tracking-wider text-slate-400">Hoặc</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        <button
          type="button"
          disabled={googleSigningIn}
          onClick={signInWithGoogle}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          <span>{googleSigningIn ? 'Đang kết nối Google...' : 'Đăng nhập bằng Google'}</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
          <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Phiên làm việc được xác thực và bảo vệ truy cập API</span>
        </div>
      </div>
    </div>
  );
}
