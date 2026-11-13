import { Activity, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { signInWithGoogle, authError } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shrink-0">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Avaya Aura CM CDR
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hệ thống thu nhận & tra cứu nhật ký cuộc gọi qua IP
            </p>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Đăng nhập quản trị viên
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Truy cập dữ liệu CDR từ dịch vụ Listen-Only TCP Adjunct của tổng đài Avaya Communication Manager.
          </p>
        </div>

        {authError && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-400">
            {authError}
          </div>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          <span>Đăng nhập bằng Google</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
          <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Phiên làm việc được xác thực và bảo vệ truy cập API</span>
        </div>
      </div>
    </div>
  );
}
