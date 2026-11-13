import { Activity, FileUp, PhoneCall, RefreshCw, Settings2, X } from 'lucide-react';

export type ActiveTab = 'cdr' | 'import' | 'cm-guide' | 'update';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof PhoneCall }> = [
  { id: 'cdr', label: 'Nhật ký cuộc gọi CDR', icon: PhoneCall },
  { id: 'import', label: 'Kiểm thử & Nạp CDR', icon: FileUp },
  { id: 'cm-guide', label: 'Cấu hình kết nối', icon: Settings2 },
  { id: 'update', label: 'Cập nhật hệ thống', icon: RefreshCw },
];

export function Sidebar({ activeTab, onSelectTab, mobileOpen, onCloseMobile }: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div>
        <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              Avaya CM CDR
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Đóng menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="p-3 space-y-1" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${
                  isActive
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="font-medium text-slate-700 dark:text-slate-300">Avaya Aura CM R10.3.x</div>
        <div>Chế độ: Legacy CDR qua IP (Listen-Only)</div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-60 shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-64 max-w-[80vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
