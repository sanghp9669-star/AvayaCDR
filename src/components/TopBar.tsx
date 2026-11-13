import { Download, LogOut, Menu, Moon, Sun } from 'lucide-react';
import type { ActiveTab } from './Sidebar';

interface TopBarProps {
  activeTab: ActiveTab;
  userEmail: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onExportCsv: () => void;
  onLogout: () => void;
  onOpenMobileMenu: () => void;
}

const TAB_BREADCRUMBS: Record<ActiveTab, string> = {
  cdr: 'Nhật ký cuộc gọi CDR',
  import: 'Kiểm thử & Nạp CDR',
  'cm-guide': 'Cấu hình kết nối & Avaya CM',
};

export function TopBar({
  activeTab,
  userEmail,
  isDark,
  onToggleTheme,
  onExportCsv,
  onLogout,
  onOpenMobileMenu,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:inline">
            Avaya Aura CM
          </span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
            {TAB_BREADCRUMBS[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {userEmail && (
          <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
            {userEmail}
          </span>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
          title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          title="Đăng xuất"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Xuất CSV</span>
        </button>
      </div>
    </header>
  );
}
