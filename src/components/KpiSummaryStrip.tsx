import type { CdrSummaryStats } from '../../shared/cdrTypes';
import { formatDuration, formatTotalHours } from '../utils/formatters';

interface KpiSummaryStripProps {
  summary: CdrSummaryStats;
  loading: boolean;
}

export function KpiSummaryStrip({ summary, loading }: KpiSummaryStripProps) {
  const items = [
    {
      label: 'Tổng bản ghi CDR',
      value: summary.totalCalls.toLocaleString('vi-VN'),
      detail: `${summary.incomingCount} vào · ${summary.outgoingCount} ra · ${summary.internalCount} nội bộ`,
    },
    {
      label: 'Thời lượng TB đàm thoại',
      value: formatDuration(summary.avgDurationSec),
      detail: `Tổng thời lượng: ${formatTotalHours(summary.totalDurationSec)}`,
    },
    {
      label: 'Cuộc gọi Tandem (Transit)',
      value: summary.tandemCount.toLocaleString('vi-VN'),
      detail: 'Chuyển tiếp giữa các tuyến trung kế',
    },
    {
      label: 'Ineffective Attempts',
      value: summary.ineffectiveCount.toLocaleString('vi-VN'),
      detail: 'Không trả lời, bận, bị chặn hoặc lỗi trunk',
    },
  ];

  return (
    <section
      aria-label="Chỉ số tổng hợp CDR"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
    >
      {items.map((item) => (
        <div key={item.label} className="p-4 sm:px-5 sm:py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {item.label}
          </div>
          {loading ? (
            <div className="mt-2 h-7 w-24 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ) : (
            <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {item.value}
            </div>
          )}
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
            {item.detail}
          </div>
        </div>
      ))}
    </section>
  );
}
