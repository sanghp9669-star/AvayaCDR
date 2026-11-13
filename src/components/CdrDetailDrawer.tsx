import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';
import {
  AVAYA_CONDITION_TABLE,
  CALL_TYPE_LABELS,
  type CdrRecordDto,
} from '../../shared/cdrTypes';
import { formatDateTimeParts, formatDuration } from '../utils/formatters';

interface CdrDetailDrawerProps {
  record: CdrRecordDto | null;
  loading: boolean;
  onClose: () => void;
}

export function CdrDetailDrawer({ record, loading, onClose }: CdrDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!record && !loading) return null;

  const handleCopyRaw = async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.rawRecord);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const condMeta = record
    ? AVAYA_CONDITION_TABLE.find((c) => c.code === record.conditionCode)
    : undefined;

  const startParts = record ? formatDateTimeParts(record.callStartTime) : null;
  const createdParts = record ? formatDateTimeParts(record.createdAt) : null;

  const rows = record
    ? [
        { label: 'ID Bản ghi', value: `#${record.id}`, mono: true },
        {
          label: 'Thời gian bắt đầu',
          value: `${startParts?.date} ${startParts?.time}`,
          mono: true,
        },
        {
          label: 'Thời lượng đàm thoại',
          value: `${formatDuration(record.callDurationSec)} (${record.callDurationSec} giây)`,
          mono: true,
        },
        { label: 'Số gọi (calling_number)', value: record.callingNumber, mono: true },
        { label: 'Số bị gọi (called_number)', value: record.calledNumber, mono: true },
        { label: 'Máy nhánh (station)', value: record.station || '-', mono: true },
        { label: 'Trunk Group', value: record.trunkGroup, mono: true },
        { label: 'Loại cuộc gọi (call_type)', value: CALL_TYPE_LABELS[record.callType], mono: false },
        {
          label: 'Condition Code',
          value: `${record.conditionCode}${condMeta ? ` — ${condMeta.meaning}` : ''}`,
          mono: false,
        },
        {
          label: 'Giải thích Condition Code',
          value: condMeta ? condMeta.viDescription : '-',
          mono: false,
        },
        { label: 'Access Code / TAC', value: record.accessCode || '-', mono: true },
        { label: 'Account Code', value: record.accountCode || '-', mono: true },
        { label: 'UCID', value: record.ucid || '-', mono: true },
        { label: 'Format Profile', value: record.formatProfile, mono: true },
        {
          label: 'Thời điểm lưu DB',
          value: `${createdParts?.date} ${createdParts?.time}`,
          mono: true,
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Chi tiết bản ghi CDR"
    >
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Chi tiết bản ghi CDR
            </h2>
            {record && (
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Record #{record.id} · Profile {record.formatProfile}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Đóng chi tiết"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="h-6 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : (
            record && (
              <>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {rows.map((row) => (
                    <div key={row.label} className="py-2.5 flex items-start justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400 shrink-0">{row.label}</dt>
                      <dd
                        className={`text-right text-slate-900 dark:text-slate-100 break-all ${
                          row.mono ? 'font-mono tabular-nums font-medium' : 'font-medium'
                        }`}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Dữ liệu thô nguyên bản (raw_record)
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyRaw}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto border border-slate-800">
                    {record.rawRecord}
                  </pre>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
