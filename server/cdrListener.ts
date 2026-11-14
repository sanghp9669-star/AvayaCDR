import dgram from 'node:dgram';
import net from 'node:net';
import type {
  CdrFormatProfile,
  CdrListenerClientDto,
  CdrListenerDiagnosticsDto,
  CdrListenerEventDto,
  CdrProtocol,
} from '../shared/cdrTypes.ts';
import { insertCdrRecord } from '../src/db/cdrRepo.ts';
import { CdrParser, tryParseDateHeaderLine } from './cdrParser.ts';
import { logListener, logRawCdr } from './logger.ts';

export interface CdrListenerConfig {
  host: string;
  port: number;
  protocol: CdrProtocol;
  formatProfile: CdrFormatProfile;
  cmSourceIp: string;
  cmNodeName: string;
  enabled: boolean;
}

interface TrackedSocketMeta {
  remoteAddr: string;
  connectedAt: string;
  bytesReceived: number;
  linesReceived: number;
}

function normalizeRemoteIp(rawIp: string | undefined): string {
  if (!rawIp) return '';
  return rawIp.replace(/^::ffff:/, '').trim();
}

function isSourceIpAllowed(remoteIp: string, allowlist: string): boolean {
  const cleanAllow = allowlist.trim();
  if (!cleanAllow) return true;
  const normalized = normalizeRemoteIp(remoteIp);
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  const allowedList = cleanAllow
    .split(/[\s,;]+/)
    .map((ip) => ip.trim())
    .filter(Boolean);
  return allowedList.includes(normalized);
}

/**
 * Avaya Aura CM "Listen-Only" CDR Adjunct Receiver Service.
 * Handles CR-only (\r), CRLF (\r\n), LF (\n), NUL-padded (\0), and idle-flushed
 * CDR streams over TCP/UDP, logs raw lines, tracks Date banner lines, parses via
 * CdrParser, persists into PostgreSQL, and exposes live adjunct telemetry.
 */
export class CdrListenerService {
  private config: CdrListenerConfig;
  private parser: CdrParser;
  private tcpServer: net.Server | null = null;
  private udpServer: dgram.Socket | null = null;
  private activeSockets = new Map<net.Socket, TrackedSocketMeta>();
  private tcpListening = false;
  private udpListening = false;

  private startedAt = new Date().toISOString();
  private lastKnownDate: Date | null = null;
  private totalConnectionsAccepted = 0;
  private totalConnectionsRejected = 0;
  private totalLinesReceived = 0;
  private totalIngested = 0;
  private totalParseErrors = 0;
  private lastConnectedAt: string | null = null;
  private lastReceivedAt: string | null = null;
  private lastIngestedAt: string | null = null;
  private recentEvents: CdrListenerEventDto[] = [];

  constructor(config: CdrListenerConfig) {
    this.config = { ...config };
    this.parser = new CdrParser(config.formatProfile);
  }

  public getConfig(): CdrListenerConfig {
    return { ...this.config };
  }

  public isListening(): boolean {
    if (!this.config.enabled) return false;
    if (this.config.protocol === 'TCP') return this.tcpListening;
    if (this.config.protocol === 'UDP') return this.udpListening;
    return this.tcpListening || this.udpListening;
  }

  public getDiagnostics(): CdrListenerDiagnosticsDto {
    const activeClients: CdrListenerClientDto[] = Array.from(this.activeSockets.values()).map(
      (meta) => ({
        remoteAddr: meta.remoteAddr,
        connectedAt: meta.connectedAt,
        bytesReceived: meta.bytesReceived,
        linesReceived: meta.linesReceived,
      })
    );

    return {
      isListening: this.isListening(),
      listenHost: this.config.host,
      listenPort: this.config.port,
      protocol: this.config.protocol,
      formatProfile: this.config.formatProfile,
      cmSourceIp: this.config.cmSourceIp,
      startedAt: this.startedAt,
      totalConnectionsAccepted: this.totalConnectionsAccepted,
      totalConnectionsRejected: this.totalConnectionsRejected,
      totalLinesReceived: this.totalLinesReceived,
      totalIngested: this.totalIngested,
      totalParseErrors: this.totalParseErrors,
      lastConnectedAt: this.lastConnectedAt,
      lastReceivedAt: this.lastReceivedAt,
      lastIngestedAt: this.lastIngestedAt,
      activeClients,
      recentEvents: [...this.recentEvents],
    };
  }

  private recordEvent(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    rawPreview?: string
  ): void {
    logListener(level, message);
    this.recentEvents.unshift({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(rawPreview ? { rawPreview: rawPreview.slice(0, 140) } : {}),
    });
    if (this.recentEvents.length > 25) {
      this.recentEvents.length = 25;
    }
  }

  private async handleRawLine(rawLine: string, sourceIp: string): Promise<void> {
    // Strip NUL bytes and CR/LF often appended by Avaya CM IP CDR links
    const sanitizedLine = rawLine.replace(/\0+/g, '').replace(/[\r\n]+/g, '');
    const trimmed = sanitizedLine.trim();
    if (!trimmed) return;

    this.totalLinesReceived += 1;
    this.lastReceivedAt = new Date().toISOString();

    // 1. Always persist raw CDR line to debug log file first
    logRawCdr(sanitizedLine, sourceIp);

    // 2. Track standalone Date header lines sent by Avaya CM (e.g. MMDDYY or DD/MM/YY)
    const bannerDate = tryParseDateHeaderLine(trimmed);
    if (bannerDate) {
      this.lastKnownDate = bannerDate;
      this.recordEvent(
        'INFO',
        `Nhận dòng ngày (Date Header) từ ${sourceIp}: ${trimmed}`,
        trimmed
      );
      return;
    }

    // 3. Parse record using modular CdrParser profile (+ automatic fallback for CM8 variants)
    try {
      const parsed = this.parser.parseLine(sanitizedLine, undefined, this.lastKnownDate);
      // 4. Persist parsed record into PostgreSQL
      const saved = await insertCdrRecord(parsed);
      this.totalIngested += 1;
      this.lastIngestedAt = new Date().toISOString();
      this.recordEvent(
        'INFO',
        `Đã lưu CDR id=${saved.id} (${saved.callType}) từ ${sourceIp}: ${saved.callingNumber} → ${saved.calledNumber}`
      );
    } catch (err) {
      this.totalParseErrors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      this.recordEvent(
        'ERROR',
        `Lỗi phân tích/lưu CDR từ ${sourceIp}: ${msg}`,
        trimmed
      );
    }
  }

  public async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    if (!this.config.enabled) {
      this.recordEvent('INFO', 'CDR Listener đang tạm tắt trong cấu hình.');
      return;
    }

    if (this.config.protocol === 'TCP' || this.config.protocol === 'BOTH') {
      await this.startTcp();
    }
    if (this.config.protocol === 'UDP' || this.config.protocol === 'BOTH') {
      await this.startUdp();
    }
  }

  private startTcp(): Promise<void> {
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        const remoteIp = normalizeRemoteIp(socket.remoteAddress);
        const remoteAddr = `${remoteIp || 'unknown'}:${socket.remotePort || 0}`;

        if (!isSourceIpAllowed(remoteIp, this.config.cmSourceIp)) {
          this.totalConnectionsRejected += 1;
          this.recordEvent(
            'WARN',
            `Từ chối kết nối TCP từ ${remoteAddr} (không nằm trong danh sách IP cho phép: ${this.config.cmSourceIp})`
          );
          socket.destroy();
          return;
        }

        const meta: TrackedSocketMeta = {
          remoteAddr,
          connectedAt: new Date().toISOString(),
          bytesReceived: 0,
          linesReceived: 0,
        };
        this.activeSockets.set(socket, meta);
        this.totalConnectionsAccepted += 1;
        this.lastConnectedAt = meta.connectedAt;
        this.recordEvent('INFO', `Avaya CM đã kết nối TCP từ ${remoteAddr} (listen-only)`);

        // Keep persistent TCP link alive when Avaya CM stays idle between calls
        socket.setKeepAlive(true, 30000);
        socket.setEncoding('utf8');

        let buffer = '';
        let idleFlushTimer: ReturnType<typeof setTimeout> | null = null;

        const clearIdleTimer = () => {
          if (idleFlushTimer) {
            clearTimeout(idleFlushTimer);
            idleFlushTimer = null;
          }
        };

        const flushBuffer = () => {
          clearIdleTimer();
          if (buffer.replace(/\0+/g, '').trim()) {
            const line = buffer;
            buffer = '';
            meta.linesReceived += 1;
            void this.handleRawLine(line, remoteAddr);
          } else {
            buffer = '';
          }
        };

        socket.on('data', (chunk: string) => {
          clearIdleTimer();
          meta.bytesReceived += Buffer.byteLength(chunk, 'utf8');
          buffer += chunk.replace(/\0+/g, '');

          // Avaya CM may terminate records with \r\n, \r (CR-only), or \n (LF)
          const parts = buffer.split(/\r\n|\n|\r/);
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (part.trim()) {
              meta.linesReceived += 1;
              void this.handleRawLine(part, remoteAddr);
            }
          }

          // Fallback for fixed-width records sent without trailing CR/LF
          if (buffer.trim().length >= 44) {
            idleFlushTimer = setTimeout(flushBuffer, 400);
          }
        });

        socket.on('end', () => {
          flushBuffer();
          this.recordEvent('INFO', `Avaya CM đóng kết nối TCP từ ${remoteAddr}`);
        });

        socket.on('close', () => {
          clearIdleTimer();
          this.activeSockets.delete(socket);
        });

        socket.on('error', (err) => {
          clearIdleTimer();
          this.recordEvent('ERROR', `Lỗi TCP socket (${remoteAddr}): ${err.message}`);
        });
      });

      this.tcpServer = server;

      server.on('error', (err: NodeJS.ErrnoException) => {
        this.tcpListening = false;
        if (err.code === 'EADDRINUSE') {
          this.recordEvent('WARN', `Cổng TCP ${this.config.port} đang được tiến trình khác sử dụng.`);
        } else {
          this.recordEvent('ERROR', `Lỗi máy chủ TCP CDR: ${err.message}`);
        }
        resolve();
      });

      server.listen(this.config.port, this.config.host, () => {
        this.tcpListening = true;
        this.recordEvent(
          'INFO',
          `CDR TCP Listener đang lắng nghe tại ${this.config.host}:${this.config.port} (profile=${this.config.formatProfile}, cmNode=${this.config.cmNodeName})`
        );
        resolve();
      });
    });
  }

  private startUdp(): Promise<void> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      this.udpServer = socket;

      socket.on('message', (msg, rinfo) => {
        if (!isSourceIpAllowed(rinfo.address, this.config.cmSourceIp)) {
          this.totalConnectionsRejected += 1;
          this.recordEvent(
            'WARN',
            `Bỏ qua gói UDP từ ${rinfo.address}:${rinfo.port} (không nằm trong danh sách IP cho phép)`
          );
          return;
        }
        const source = `${rinfo.address}:${rinfo.port}`;
        this.lastReceivedAt = new Date().toISOString();
        const lines = msg
          .toString('utf8')
          .replace(/\0+/g, '')
          .split(/\r\n|\r|\n/);
        for (const line of lines) {
          if (line.trim()) {
            void this.handleRawLine(line, source);
          }
        }
      });

      socket.on('error', (err) => {
        this.udpListening = false;
        this.recordEvent('ERROR', `Lỗi máy chủ UDP CDR: ${err.message}`);
        resolve();
      });

      socket.bind(this.config.port, this.config.host, () => {
        this.udpListening = true;
        this.recordEvent(
          'INFO',
          `CDR UDP Listener đang lắng nghe tại ${this.config.host}:${this.config.port}`
        );
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    for (const sock of this.activeSockets.keys()) {
      sock.destroy();
    }
    this.activeSockets.clear();

    const closePromises: Array<Promise<void>> = [];

    if (this.tcpServer) {
      const srv = this.tcpServer;
      this.tcpServer = null;
      this.tcpListening = false;
      closePromises.push(
        new Promise((resolve) => {
          srv.close(() => resolve());
        })
      );
    }

    if (this.udpServer) {
      const udp = this.udpServer;
      this.udpServer = null;
      this.udpListening = false;
      closePromises.push(
        new Promise((resolve) => {
          udp.close(() => resolve());
        })
      );
    }

    await Promise.all(closePromises);
  }

  public async reconfigure(nextConfig: CdrListenerConfig): Promise<void> {
    this.recordEvent(
      'INFO',
      `Áp dụng lại cấu hình CDR Listener -> enabled=${nextConfig.enabled} ${nextConfig.protocol} ${nextConfig.host}:${nextConfig.port} profile=${nextConfig.formatProfile}`
    );
    await this.stop();
    this.config = { ...nextConfig };
    this.parser.setProfile(nextConfig.formatProfile);
    await this.start();
  }
}
