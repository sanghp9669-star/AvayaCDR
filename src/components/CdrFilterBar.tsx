import { Radio, RefreshCw, RotateCcw } from 'lucide-react';
import {
  MAX_EXTENSION_LENGTH,
  type CdrCallType,
  type CdrQueryFilter,
} from '../../shared/cdrTypes';

interface CdrFilterBarProps {
  filter: CdrQueryFilter;
  onChange: (patch: Partial<CdrQueryFilter>) => void;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onSendTcpTest: () => void;
  sendingTcp: boolean;
}

const CALL_TYPE_OPTIONS: Array<{ value: CdrCallType | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'incoming', label: 'Incoming (Vào)' },
  { value: 'outgoing', label: 'Outgoing (Ra)' },
  { value: 'tandem', label: 'Tandem' },
  { value: 'internal', label: 'Internal (Nội bộ)' },
  { value: 'ineffective', label: 'Ineffective (Lỗi/Nhỡ)' },
];

export function CdrFilterBar({
  filter,
  onChange,
  onReset,
  onRefresh,
  refreshing,
  autoRefresh,
  onToggleAutoRefresh,
  onSendTcpTest,
  sendingTcp,
}: CdrFilterBarProps) {
  const activeCallType = filter.call_type || 'all';

  return (
    <section
      aria-label="Bộ lọc CDR Avaya Aura CM"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div>
          <label
            htmlFor="cdr-filter-from"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Từ thời gian (from)
          </label>
          <input
            id="cdr-filter-from"
            type="datetime-local"
            value={filter.from || ''}
            onChange={(e) => onChange({ from: e.target.value || undefined, page: 1 })}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>

        <div>
          <label
            htmlFor="cdr-filter-to"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Đến thời gian (to)
          </label>
          <input
            id="cdr-filter-to"
            type="datetime-local"
            value={filter.to || ''}
            onChange={(e) => onChange({ to: e.target.value || undefined, page: 1 })}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>

        <div>
          <label
            htmlFor="cdr-filter-station"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Máy nhánh (tối đa 4 số)
          </label>
          <input
            id="cdr-filter-station"
            type="text"
            inputMode="numeric"
            maxLength={MAX_EXTENSION_LENGTH}
            placeholder="VD: 3001"
            value={filter.station || ''}
            onChange={(e) =>
              onChange({
                station: e.target.value.replace(/\D/g, '').slice(0, MAX_EXTENSION_LENGTH),
                page: 1,
              })
            }
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>

        <div>
          <label
            htmlFor="cdr-filter-calling"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Số gọi (calling_number)
          </label>
          <input
            id="cdr-filter-calling"
            type="text"
            placeholder="VD: 2101, 0903..."
            value={filter.calling_number || ''}
            onChange={(e) => onChange({ calling_number: e.target.value, page: 1 })}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>

        <div>
          <label
            htmlFor="cdr-filter-called"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Số bị gọi (called_number)
          </label>
          <input
            id="cdr-filter-called"
            type="text"
            placeholder="VD: 3001, 0987..."
            value={filter.called_number || ''}
            onChange={(e) => onChange({ called_number: e.target.value, page: 1 })}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>

        <div>
          <label
            htmlFor="cdr-filter-trunk"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
          >
            Trunk Group
          </label>
          <input
            id="cdr-filter-trunk"
            type="text"
            placeholder="VD: TG-1, TG-2..."
            value={filter.trunk_group || ''}
            onChange={(e) => onChange({ trunk_group: e.target.value, page: 1 })}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Loại cuộc gọi:
          </span>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {CALL_TYPE_OPTIONS.map((opt) => {
              const isActive = activeCallType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ call_type: opt.value, page: 1 })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={onToggleAutoRefresh}
              className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-600"
            />
            <span>Tự động 5s</span>
          </label>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={onSendTcpTest}
            disabled={sendingTcp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Radio className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
            <span>{sendingTcp ? 'Đang gửi TCP...' : 'Gửi 1 gói CDR qua TCP'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Đặt lại</span>
          </button>
        </div>
      </div>
    </section>
  );
}
