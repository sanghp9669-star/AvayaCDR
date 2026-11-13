import dgram from 'node:dgram';
import net from 'node:net';
import type { CdrFormatProfile, CdrProtocol } from '../shared/cdrTypes.ts';
import { insertCdrRecord } from '../src/db/cdrRepo.ts';
import { CdrParser } from './cdrParser.ts';
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

function normalizeRemoteIp(rawIp: string | undefined): string {
  if (!rawIp) return '';
  return rawIp.replace(/^::ffff:/, '').trim();
}

function isSourceIpAllowed(remoteIp: string, allowlist: string): boolean {
  const cleanAllow = allowlist.trim();
  if (!cleanAllow) return true;
  const normalized = normalizeRemoteIp(remoteIp);
  // Allow loopback self-test calls alongside configured Avaya CM IPs
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  const allowedList = cleanAllow
    .split(/[\s,;]+/)
    .map((ip) => ip.trim())
    .filter(Boolean);
  return allowedList.includes(normalized);
}

/**
 * Avaya Aura CM "Listen-Only" CDR Adjunct Receiver Service.
 * Listens on configured TCP (and optionally UDP) port, reads newline-delimited
 * CDR records sent by Avaya CM (`change ip-services` -> CDR1), writes raw records
 * to disk (`logs/cdr-raw.log`), parses via CdrParser, and stores in PostgreSQL.
 */
export class CdrListenerService {
  private config: CdrListenerConfig;
  private parser: CdrParser;
  private tcpServer: net.Server | null = null;
  private udpServer: dgram.Socket | null = null;
  private activeSockets = new Set<net.Socket>();
  private tcpListening = false;
  private udpListening = false;

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

  private async handleRawLine(rawLine: string, sourceIp: string): Promise<void> {
    const trimmed = rawLine.replace(/[\r\n]+/g, '').trim();
    if (!trimmed) return;

    // 1. Always persist raw CDR line to debug log file first
    logRawCdr(rawLine, sourceIp);

    // 2. Parse record using modular CdrParser profile
    try {
      const parsed = this.parser.parseLine(rawLine);
      // 3. Persist parsed record into PostgreSQL
      const saved = await insertCdrRecord(parsed);
      logListener(
        'INFO',
        `Ingested CDR id=${saved.id} type=${saved.callType} from=${sourceIp} profile=${saved.formatProfile} calling=${saved.callingNumber} called=${saved.calledNumber}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logListener('ERROR', `Failed to process CDR line from ${sourceIp}: ${msg}`);
    }
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      logListener('INFO', 'CDR Listener is disabled in configuration.');
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
          logListener('WARN', `Rejected unauthorized TCP connection from ${remoteAddr} (allowed: ${this.config.cmSourceIp})`);
          socket.destroy();
          return;
        }

        this.activeSockets.add(socket);
        logListener('INFO', `Avaya CM TCP connection established from ${remoteAddr} (listen-only)`);

        let buffer = '';
        socket.setEncoding('utf8');

        socket.on('data', (chunk: string) => {
          buffer += chunk;
          let newlineIdx = buffer.indexOf('\n');
          while (newlineIdx !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            void this.handleRawLine(line, remoteAddr);
            newlineIdx = buffer.indexOf('\n');
          }
        });

        socket.on('end', () => {
          if (buffer.trim()) {
            void this.handleRawLine(buffer, remoteAddr);
            buffer = '';
          }
          logListener('INFO', `Avaya CM TCP connection closed from ${remoteAddr}`);
        });

        socket.on('close', () => {
          this.activeSockets.delete(socket);
        });

        socket.on('error', (err) => {
          logListener('ERROR', `TCP socket error (${remoteAddr}): ${err.message}`);
        });
      });

      this.tcpServer = server;

      server.on('error', (err: NodeJS.ErrnoException) => {
        this.tcpListening = false;
        if (err.code === 'EADDRINUSE') {
          logListener('WARN', `TCP CDR listener port ${this.config.port} is already in use.`);
        } else {
          logListener('ERROR', `TCP CDR server error: ${err.message}`);
        }
        resolve();
      });

      server.listen(this.config.port, this.config.host, () => {
        this.tcpListening = true;
        logListener(
          'INFO',
          `CDR TCP Listener listening on ${this.config.host}:${this.config.port} (profile=${this.config.formatProfile}, cmNode=${this.config.cmNodeName})`
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
          logListener('WARN', `Ignored unauthorized UDP packet from ${rinfo.address}:${rinfo.port}`);
          return;
        }
        const source = `${rinfo.address}:${rinfo.port}`;
        const lines = msg.toString('utf8').split(/\r?\n/);
        for (const line of lines) {
          if (line.trim()) {
            void this.handleRawLine(line, source);
          }
        }
      });

      socket.on('error', (err) => {
        this.udpListening = false;
        logListener('ERROR', `UDP CDR server error: ${err.message}`);
        resolve();
      });

      socket.bind(this.config.port, this.config.host, () => {
        this.udpListening = true;
        logListener('INFO', `CDR UDP Listener listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    for (const sock of this.activeSockets) {
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
    logListener(
      'INFO',
      `Reconfiguring CDR Listener -> enabled=${nextConfig.enabled} ${nextConfig.protocol} ${nextConfig.host}:${nextConfig.port} profile=${nextConfig.formatProfile}`
    );
    await this.stop();
    this.config = { ...nextConfig };
    this.parser.setProfile(nextConfig.formatProfile);
    await this.start();
  }
}
