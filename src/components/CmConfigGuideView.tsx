import { AlertCircle, CheckCircle2, PauseCircle, Radio, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AVAYA_CONDITION_TABLE,
  type CdrConnectionConfigDto,
  type CdrFormatProfile,
  type CdrListenerDiagnosticsDto,
  type CdrProtocol,
} from '../../shared/cdrTypes';
import { useAuth } from '../context/AuthContext';
import {
  fetchConfigInfo,
  fetchListenerDiagnostics,
  triggerTcpTestCall,
  updateConnectionConfig,
  type ListenerConfigInfo,
} from '../services/cdrApi';
import { formatDateTimeParts } from '../utils/formatters';

export function CmConfigGuideView() {
  const { getToken } = useAuth();
  const [configInfo, setConfigInfo] = useState<ListenerConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTcp, setTestingTcp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<CdrListenerDiagnosticsDto | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Editable connection form state
  const [listenHost, setListenHost] = useState('0.0.0.0');
  const [listenPort, setListenPort] = useState('5000');
  const [protocol, setProtocol] = useState<CdrProtocol>('TCP');
  const [formatProfile, setFormatProfile] = useState<CdrFormatProfile>('CM4PLUS');
  const [cmNodeName, setCmNodeName] = useState('procr');
  const [cmSourceIp, setCmSourceIp] = useState('');
  const [enabled, setEnabled] = useState(true);

  const applyConnectionToForm = (conn: CdrConnectionConfigDto) => {
    setListenHost(conn.listenHost);
    setListenPort(String(conn.listenPort));
    setProtocol(conn.protocol);
    setFormatProfile(conn.formatProfile);
    setCmNodeName(conn.cmNodeName);
    setCmSourceIp(conn.cmSourceIp);
    setEnabled(conn.enabled);
  };

  const refreshDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const token = await getToken();
      const diag = await fetchListenerDiagnostics(token);
      setDiagnostics(diag);
    } catch {
      // Non-fatal
    } finally {
      setDiagLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getToken()
      .then((token) => Promise.all([fetchConfigInfo(token), fetchListenerDiagnostics(token)]))
      .then(([info, diag]) => {
        if (!mounted) return;
        setConfigInfo(info);
        setDiagnostics(diag);
        applyConnectionToForm(info.connection);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải cấu hình kết nối.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [getToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const parsedPort = Number.parseInt(listenPort, 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1024 || parsedPort > 65535) {
      setError('Cổng lắng nghe (Listen Port) phải là số nguyên từ 1024 đến 65535.');
      setSaving(false);
      return;
    }

    try {
      const token = await getToken();
      const updated = await updateConnectionConfig(token, {
        listenHost: listenHost.trim() || '0.0.0.0',
        listenPort: parsedPort,
        protocol,
        formatProfile,
        cmNodeName: cmNodeName.trim() || 'procr',
        cmSourceIp: cmSourceIp.trim(),
        enabled,
      });

      setConfigInfo((prev) => (prev ? { ...prev, connection: updated } : prev));
      applyConnectionToForm(updated);
      void refreshDiagnostics();
      setSuccessMsg(
        updated.enabled
          ? `Đã lưu và áp dụng cấu hình: ${updated.protocol} ${updated.listenHost}:${updated.listenPort} (Profile: ${updated.formatProfile}).`
          : 'Đã lưu cấu hình và tạm dừng dịch vụ CDR Listener.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu cấu hình kết nối.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestActiveTcp = async () => {
    setTestingTcp(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = await getToken();
      const res = await triggerTcpTestCall(token);
      void refreshDiagnostics();
      setSuccessMsg(
        `Đã gửi thành công bản tin CDR qua TCP tới cổng ${res.port} (${res.profile}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi gói CDR thử nghiệm qua TCP.');
    } finally {
      setTestingTcp(false);
    }
  };

  const activeConn = configInfo?.connection;
  const displayPort = activeConn?.listenPort ?? (Number.parseInt(listenPort, 10) || 5000);
  const displayNode = activeConn?.cmNodeName || cmNodeName || 'procr';

  return (
    <div className="space-y-5">
      {/* Editable Connection Parameters Panel */}
      <section
        aria-label="Cấu hình tham số kết nối CDR Listener"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Tham số kết nối CDR Listener (Avaya Aura CM)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Thay đổi cổng lắng nghe, giao thức, định dạng CDR hoặc IP tổng đài được phép gửi dữ liệu và áp dụng trực tiếp mà không cần khởi động lại máy chủ.
            </p>
          </div>

          {activeConn && (
            <div className="text-xs flex items-center gap-2 shrink-0">
              {activeConn.isListening ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-mono tabular-nums">
                    Đang lắng nghe {activeConn.protocol} {activeConn.listenHost}:{activeConn.listenPort}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <PauseCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Listener đang tạm dừng</span>
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="conn-listen-host"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Bind IP / Host trên Linux Server
                </label>
                <input
                  id="conn-listen-host"
                  type="text"
                  value={listenHost}
                  onChange={(e) => setListenHost(e.target.value)}
                  placeholder="0.0.0.0"
                  required
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Dùng <code className="font-mono">0.0.0.0</code> để lắng nghe trên mọi card mạng.
                </p>
              </div>

              <div>
                <label
                  htmlFor="conn-listen-port"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Cổng lắng nghe (Listen Port)
                </label>
                <input
                  id="conn-listen-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={listenPort}
                  onChange={(e) => setListenPort(e.target.value)}
                  required
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Phải khớp với <code className="font-mono">Remote Port</code> của <code className="font-mono">CDR1</code> (1024–65535).
                </p>
              </div>

              <div>
                <label
                  htmlFor="conn-protocol"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Giao thức nhận CDR (Protocol)
                </label>
                <select
                  id="conn-protocol"
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value as CdrProtocol)}
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                >
                  <option value="TCP">TCP (Khuyến nghị cho Avaya CM)</option>
                  <option value="UDP">UDP</option>
                  <option value="BOTH">BOTH (TCP + UDP)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Avaya CM Legacy CDR mặc định đẩy qua TCP.
                </p>
              </div>

              <div>
                <label
                  htmlFor="conn-profile"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Format Profile (Bộ phân tích CDR)
                </label>
                <select
                  id="conn-profile"
                  value={formatProfile}
                  onChange={(e) => setFormatProfile(e.target.value as CdrFormatProfile)}
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                >
                  <option value="CM4PLUS">CM4PLUS (Avaya CM 4.x – R10.3.x)</option>
                  <option value="LEGACY">LEGACY (Definity / CM 1.x–3.x)</option>
                  <option value="UNFORMATTED">UNFORMATTED (Space-delimited)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Khớp với cấu hình <code className="font-mono">Primary Output Format</code> trên CM.
                </p>
              </div>

              <div>
                <label
                  htmlFor="conn-cm-node"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Local Node trên Avaya CM
                </label>
                <input
                  id="conn-cm-node"
                  type="text"
                  value={cmNodeName}
                  onChange={(e) => setCmNodeName(e.target.value)}
                  placeholder="procr"
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Thường là <code className="font-mono">procr</code> hoặc tên node CLAN.
                </p>
              </div>

              <div>
                <label
                  htmlFor="conn-cm-ip"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  IP Tổng đài Avaya CM được phép (Allowlist)
                </label>
                <input
                  id="conn-cm-ip"
                  type="text"
                  value={cmSourceIp}
                  onChange={(e) => setCmSourceIp(e.target.value)}
                  placeholder="Để trống = cho phép mọi IP"
                  className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  VD: <code className="font-mono">10.10.1.50, 10.10.1.51</code> (tùy chọn).
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
                />
                <span>Kích hoạt dịch vụ CDR Listener (Listen-Only)</span>
              </label>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={testingTcp || !enabled || protocol === 'UDP'}
                  onClick={handleTestActiveTcp}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Radio className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                  <span>{testingTcp ? 'Đang gửi...' : 'Kiểm thử kết nối TCP'}</span>
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{saving ? 'Đang áp dụng...' : 'Lưu & Áp dụng cấu hình'}</span>
                </button>
              </div>
            </div>

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
          </form>
        )}
      </section>

      {/* Live Avaya CM TCP/UDP Socket & Ingestion Diagnostics */}
      {diagnostics && (
        <section
          aria-label="Chẩn đoán kết nối từ Avaya CM"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Giám sát kết nối trực tiếp từ Avaya CM ({diagnostics.protocol} cổng {diagnostics.listenPort})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kiểm tra xem tổng đài đã mở socket TCP tới server hay chưa và xem dòng CDR thô gần nhất nhận được.
              </p>
            </div>

            <button
              type="button"
              disabled={diagLoading}
              onClick={refreshDiagnostics}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${diagLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Làm mới chẩn đoán</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="p-3">
              <div className="text-slate-500 dark:text-slate-400">Kết nối CM đang mở</div>
              <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
                {diagnostics.activeClients.length}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Từ chối IP: {diagnostics.totalConnectionsRejected}
              </div>
            </div>
            <div className="p-3">
              <div className="text-slate-500 dark:text-slate-400">Số dòng CDR nhận được</div>
              <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
                {diagnostics.totalLinesReceived}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {diagnostics.lastReceivedAt
                  ? formatDateTimeParts(diagnostics.lastReceivedAt).time
                  : 'Chưa nhận gói nào'}
              </div>
            </div>
            <div className="p-3">
              <div className="text-slate-500 dark:text-slate-400">Phân tích &amp; lưu thành công</div>
              <div className="mt-1 font-mono tabular-nums text-base font-bold text-emerald-700 dark:text-emerald-400">
                {diagnostics.totalIngested}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {diagnostics.lastIngestedAt
                  ? formatDateTimeParts(diagnostics.lastIngestedAt).time
                  : '-'}
              </div>
            </div>
            <div className="p-3">
              <div className="text-slate-500 dark:text-slate-400">Lỗi định dạng / xử lý</div>
              <div
                className={`mt-1 font-mono tabular-nums text-base font-bold ${
                  diagnostics.totalParseErrors > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {diagnostics.totalParseErrors}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Kiểm tra nhật ký bên dưới
              </div>
            </div>
          </div>

          {diagnostics.activeClients.length > 0 && (
            <div className="space-y-1.5 text-xs">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Phiên TCP đang kết nối từ tổng đài:
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {diagnostics.activeClients.map((client) => {
                  const t = formatDateTimeParts(client.connectedAt);
                  return (
                    <div
                      key={client.remoteAddr}
                      className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 font-mono"
                    >
                      <span className="text-slate-900 dark:text-slate-100 font-semibold">
                        {client.remoteAddr}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        Kết nối lúc {t.time} {t.date} · {client.bytesReceived} bytes ·{' '}
                        {client.linesReceived} dòng
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {diagnostics.recentEvents.length > 0 && (
            <div className="space-y-1.5 text-xs">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Nhật ký nhận dữ liệu gần đây:
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/60">
                {diagnostics.recentEvents.map((ev, idx) => {
                  const t = formatDateTimeParts(ev.timestamp);
                  return (
                    <div key={idx} className="px-3 py-2 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`font-medium ${
                            ev.level === 'ERROR'
                              ? 'text-red-700 dark:text-red-400'
                              : ev.level === 'WARN'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          [{ev.level}] {ev.message}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {t.time}
                        </span>
                      </div>
                      {ev.rawPreview && (
                        <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto">
                          RAW: {ev.rawPreview}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Dynamic Avaya CM SAT Configuration Guide matching saved port & node */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Lệnh cấu hình tương ứng trên Avaya Aura Communication Manager (SAT)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Các thông số dưới đây tự động cập nhật theo cổng{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {displayPort}
            </span>{' '}
            và node{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {displayNode}
            </span>{' '}
            bạn đã cấu hình ở trên.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
            <div className="font-display font-semibold text-slate-900 dark:text-slate-100">
              01. Khai báo Node Name IP
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Chạy <code className="font-mono">change node-names ip</code> để trỏ tới IP máy chủ Linux chạy ứng dụng này:
            </p>
            <pre className="p-2.5 rounded bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto">
{`Name: cdr-server
IP Address: <IP_LINUX_SERVER>`}
            </pre>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
            <div className="font-display font-semibold text-slate-900 dark:text-slate-100">
              02. Cấu hình IP Services (CDR1)
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Chạy <code className="font-mono">change ip-services</code> với dịch vụ <code className="font-mono">CDR1</code>:
            </p>
            <pre className="p-2.5 rounded bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto">
{`Service Type: CDR1
Enabled: y
Local Node: ${displayNode}
Local Port: 0
Remote Node: cdr-server
Remote Port: ${displayPort}`}
            </pre>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
            <div className="font-display font-semibold text-slate-900 dark:text-slate-100">
              03. Bật System Parameters CDR
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Chạy <code className="font-mono">change system-parameters cdr</code> để kích hoạt Legacy CDR:
            </p>
            <pre className="p-2.5 rounded bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto">
{`CDR Date Format: month/day
Primary Output Format: unformatted
Primary Output Endpoint: CDR1
Record Outgoing Calls only? n
Intra-switch CDR? y`}
            </pre>
          </div>
        </div>
      </section>

      {configInfo && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Cấu trúc vị trí trường (Field Mapping) của các Format Profile
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {configInfo.profiles
              .filter((p) => p.name !== 'UNFORMATTED')
              .map((prof) => (
                <div
                  key={prof.name}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {prof.name}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Min {prof.minLineLength} chars
                    </span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-3 font-medium">Trường</th>
                        <th className="py-2 px-3 font-medium">Offset</th>
                        <th className="py-2 px-3 font-medium">Độ dài</th>
                        <th className="py-2 px-3 font-medium">Mô tả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {Object.entries(prof.fields).map(([key, spec]) => (
                        <tr key={key}>
                          <td className="py-1.5 px-3 font-mono text-slate-900 dark:text-slate-100">
                            {key}
                          </td>
                          <td className="py-1.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {spec.start}
                          </td>
                          <td className="py-1.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {spec.length}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600 dark:text-slate-300">
                            {spec.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Bảng tham chiếu Condition Code Avaya Aura CM
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Code</th>
                <th className="py-2.5 px-3 font-medium">Ý nghĩa chuẩn Avaya</th>
                <th className="py-2.5 px-4 font-medium">Mô tả nghiệp vụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {AVAYA_CONDITION_TABLE.map((c) => (
                <tr key={c.code} className="h-9">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {c.code}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                    {c.meaning}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{c.viDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
