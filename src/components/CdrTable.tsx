import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  GitBranch,
} from 'lucide-react';
import {
  CALL_TYPE_LABELS,
  type CdrCallType,
  type CdrQueryFilter,
  type CdrRecordDto,
} from '../../shared/cdrTypes';
import { formatDateTimeParts, formatDuration } from '../utils/formatters';

interface CdrTableProps {
  records: CdrRecordDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  sortBy: CdrQueryFilter['sortBy'];
  sortDir: CdrQueryFilter['sortDir'];
  selectedId: number | null;
  onSort: (col: NonNullable<CdrQueryFilter['sortBy']>) => void;
  onViewDetail: (id: number) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSeedSamples: () => void;
  seeding: boolean;
}

function renderCallTypeCell(callType: CdrCallType) {
  switch (callType) {
    case 'incoming':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{CALL_TYPE_LABELS[callType]}</span>
        </span>
      );
    case 'outgoing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap">
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{CALL_TYPE_LABELS[callType]}</span>
        </span>
      );
    case 'tandem':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{CALL_TYPE_LABELS[callType]}</span>
        </span>
      );
    case 'internal':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{CALL_TYPE_LABELS[callType]}</span>
        </span>
      );
    case 'ineffective':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{CALL_TYPE_LABELS[callType]}</span>
        </span>
      );
  }
}

export function CdrTable({
  records,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  sortBy,
  sortDir,
  selectedId,
  onSort,
  onViewDetail,
  onPageChange,
  onPageSizeChange,
  onSeedSamples,
  seeding,
}: CdrTableProps) {
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const renderSortBtn = (col: NonNullable<CdrQueryFilter['sortBy']>, label: string) => {
    const active = sortBy === col;
    return (
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 font-medium transition-colors whitespace-nowrap ${
          active
            ? 'text-slate-900 dark:text-slate-100'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <span>{label}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        {active && <span className="sr-only">{sortDir === 'asc' ? 'tăng dần' : 'giảm dần'}</span>}
      </button>
    );
  };

  return (
    <section
      aria-label="Danh sách bản ghi CDR"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-xs">
              <th className="py-2.5 px-4 font-medium">{renderSortBtn('call_start_time', 'Thời gian')}</th>
              <th className="py-2.5 px-3 font-medium text-right">
                {renderSortBtn('call_duration_sec', 'Duration')}
              </th>
              <th className="py-2.5 px-3 font-medium">{renderSortBtn('calling_number', 'Calling')}</th>
              <th className="py-2.5 px-3 font-medium">{renderSortBtn('called_number', 'Called')}</th>
              <th className="py-2.5 px-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Trunk
              </th>
              <th className="py-2.5 px-3 font-medium">{renderSortBtn('call_type', 'Call Type')}</th>
              <th className="py-2.5 px-4 font-medium text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Chi tiết
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-11">
                  <td className="px-4 py-2">
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-12 ml-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-4 w-14 ml-auto rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  </td>
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 px-6 text-center">
                  <div className="max-w-md mx-auto space-y-2">
                    <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Chưa có bản ghi CDR nào phù hợp
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Dịch vụ CDR Listener đang sẵn sàng nhận dữ liệu TCP từ Avaya Aura CM. Bạn có thể nạp dữ liệu mẫu hoặc gửi gói CDR qua TCP để kiểm thử.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={seeding}
                        onClick={onSeedSamples}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {seeding ? 'Đang nạp dữ liệu...' : 'Nạp 10 bản ghi CDR mẫu'}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((rec) => {
                const { date, time } = formatDateTimeParts(rec.callStartTime);
                const isSelected = selectedId === rec.id;

                return (
                  <tr
                    key={rec.id}
                    className={`h-11 transition-colors ${
                      isSelected
                        ? 'bg-red-50/70 dark:bg-red-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-2 whitespace-nowrap font-mono tabular-nums text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{time}</span>
                      <span className="text-slate-400 dark:text-slate-500 ml-2">{date}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatDuration(rec.callDurationSec)}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {rec.callingNumber}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {rec.calledNumber}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {rec.trunkGroup}
                    </td>
                    <td className="px-3 py-2">{renderCallTypeCell(rec.callType)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onViewDetail(rec.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Chi tiết</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400">
        <div className="tabular-nums">
          Hiển thị <span className="font-semibold text-slate-900 dark:text-slate-100">{startItem}</span>
          –
          <span className="font-semibold text-slate-900 dark:text-slate-100">{endItem}</span> trên{' '}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {total.toLocaleString('vi-VN')}
          </span>{' '}
          bản ghi
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span>Số dòng:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-mono tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Trang sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
