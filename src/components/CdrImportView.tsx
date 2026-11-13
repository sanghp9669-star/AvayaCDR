import { AlertCircle, CheckCircle2, FileUp, Radio, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import type { CdrFormatProfile } from '../../shared/cdrTypes';
import { useAuth } from '../context/AuthContext';
import {
  importRawCdrLines,
  triggerTcpTestCall,
  type ImportCdrResult,
} from '../services/cdrApi';
import { formatDateTimeParts, formatDuration } from '../utils/formatters';

interface CdrImportViewProps {
  onImported: () => void;
}

const SAMPLE_BY_PROFILE: Record<CdrFormatProfile, string> = {
  CM4PLUS: `1112260915000359801 3001              0903451289     AC1001  00013001 00001000011731458290
1112260922000220801 90912883401       2101           AC2101  00012101 00001000021731458291
1112260935000004802 90987654321       2102                   00022102 00001000031731458292
111226094800016E803 902838221045      0938112299     TD9001  0003     00001000041731458293`,
  LEGACY: `111226091500359801 3001           0903451289AC10010001
111226092200220801 90912883401    2101      AC21010001
111226093500004802 90987654321    2102            0002`,
  UNFORMATTED: `111226 0915 00035 9 801 3001 0903451289 AC1001 1 00001000011731458290
111226 0922 00022 0 801 90912883401 2101 AC2101 1 00001000021731458291
111226 0935 00000 4 802 90987654321 2102 - 2 00001000031731458292`,
};

export function CdrImportView({ onImported }: CdrImportViewProps) {
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<CdrFormatProfile>('UNFORMATTED');
  const [rawText, setRawText] = useState(SAMPLE_BY_PROFILE.UNFORMATTED);
  const [previewResult, setPreviewResult] = useState<ImportCdrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tcpStatus, setTcpStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleProfileChange = (nextProfile: CdrFormatProfile) => {
    setProfile(nextProfile);
    setRawText(SAMPLE_BY_PROFILE[nextProfile]);
    setPreviewResult(null);
    setError(null);
    setSuccessMsg(null);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawText(reader.result);
        setPreviewResult(null);
        setError(null);
        setSuccessMsg(null);
      }
    };
    reader.readAsText(file);
  };

  const handleParse = async (dryRun: boolean) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = await getToken();
      const res = await importRawCdrLines(token, rawText, profile, dryRun);
      setPreviewResult(res);
      if (!dryRun && res.addedCount > 0) {
        setSuccessMsg(`Đã phân tích và lưu ${res.addedCount} bản ghi CDR vào hệ thống.`);
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi phân tích dữ liệu CDR');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTcpLine = async () => {
    setLoading(true);
    setError(null);
    setTcpStatus(null);
    try {
      const token = await getToken();
      const res = await triggerTcpTestCall(token, profile);
      setTcpStatus(`Đã gửi bản ghi qua TCP tới cổng ${res.port} (${res.profile}): ${res.rawLine}`);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi gói TCP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Kiểm thử CdrParser & Nạp dữ liệu CDR thô
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Chọn Format Profile (<span className="font-mono">CM4PLUS</span>,{' '}
              <span className="font-mono">LEGACY</span>, hoặc{' '}
              <span className="font-mono">UNFORMATTED</span>), kiểm tra kết quả bóc tách từng trường hoặc gửi trực tiếp gói CDR qua TCP tới CDR Listener Service.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tải tệp .log / .txt</span>
            <input
              type="file"
              accept=".txt,.log,.cdr"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Format Profile:
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['UNFORMATTED', 'CM4PLUS', 'LEGACY'] as CdrFormatProfile[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProfileChange(p)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  profile === p
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Dán các dòng bản tin CDR từ Avaya Communication Manager..."
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
        />

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {tcpStatus && (
          <div className="text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 break-all">
            {tcpStatus}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={loading || !rawText.trim()}
            onClick={() => handleParse(true)}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Chạy thử Parser (Dry Run)
          </button>

          <button
            type="button"
            disabled={loading || !rawText.trim()}
            onClick={() => handleParse(false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Phân tích & Lưu bản ghi</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleSendTcpLine}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Radio className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
            <span>Gửi mẫu qua TCP Listener</span>
          </button>
        </div>
      </section>

      {previewResult && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Kết quả bóc tách ({previewResult.profile}): {previewResult.parsedCount} dòng hợp lệ ·{' '}
            {previewResult.errorCount} dòng lỗi
          </div>

          {previewResult.errors.length > 0 && (
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-red-50/50 dark:bg-red-950/20 space-y-1 text-xs text-red-700 dark:text-red-400">
              {previewResult.errors.map((errItem) => (
                <div key={errItem.lineNumber} className="font-mono">
                  Dòng {errItem.lineNumber}: {errItem.reason}
                </div>
              ))}
            </div>
          )}

          {previewResult.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-4 font-medium">Thời gian</th>
                    <th className="py-2 px-3 font-medium text-right">Duration</th>
                    <th className="py-2 px-3 font-medium">Calling</th>
                    <th className="py-2 px-3 font-medium">Called</th>
                    <th className="py-2 px-3 font-medium">Station</th>
                    <th className="py-2 px-3 font-medium">Trunk</th>
                    <th className="py-2 px-3 font-medium">Call Type</th>
                    <th className="py-2 px-4 font-medium">Cond · UCID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {previewResult.preview.map((item, idx) => {
                    const { date, time } = formatDateTimeParts(item.callStartTime);
                    return (
                      <tr key={idx} className="h-10">
                        <td className="px-4 py-2 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {date} {time}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatDuration(item.callDurationSec)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {item.callingNumber}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {item.calledNumber}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {item.station || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                          {item.trunkGroup}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                          {item.callType}
                        </td>
                        <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">
                          {item.conditionCode} · {item.ucid || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
