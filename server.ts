import 'dotenv/config';
import express from 'express';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CdrCallType,
  CdrConnectionConfigDto,
  CdrFormatProfile,
  CdrProtocol,
  CdrQueryFilter,
} from './shared/cdrTypes.ts';
import { CdrListenerService } from './server/cdrListener.ts';
import {
  buildFixedWidthCdrLine,
  CDR_FORMAT_PROFILES,
  CdrParser,
} from './server/cdrParser.ts';
import { logAccess, logError } from './server/logger.ts';
import {
  exportCdrRecords,
  getCdrRecordById,
  insertCdrRecord,
  listCdrRecords,
  seedSampleAvayaRecords,
} from './src/db/cdrRepo.ts';
import {
  getStoredConnectionSettings,
  saveConnectionSettings,
} from './src/db/settingsRepo.ts';
import {
  applyGitHubUpdate,
  checkGitHubUpdate,
  FIXED_GITHUB_BRANCH,
  FIXED_GITHUB_REPO,
  getLocalGitInfo,
  readPackageVersion,
} from './server/updater.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEB_PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
const DEFAULT_LISTEN_PORT = Number.parseInt(process.env.CDR_LISTEN_PORT || '5000', 10) || 5000;
const DEFAULT_LISTEN_HOST = process.env.CDR_LISTEN_HOST || '0.0.0.0';
const DEFAULT_PROTOCOL: CdrProtocol =
  process.env.CDR_PROTOCOL === 'UDP' || process.env.CDR_PROTOCOL === 'BOTH'
    ? process.env.CDR_PROTOCOL
    : 'TCP';
const RAW_PROFILE = (process.env.CDR_FORMAT_PROFILE || 'CM4PLUS').toUpperCase();
const DEFAULT_FORMAT_PROFILE: CdrFormatProfile =
  RAW_PROFILE === 'LEGACY' || RAW_PROFILE === 'UNFORMATTED' || RAW_PROFILE === 'CM4PLUS'
    ? RAW_PROFILE
    : 'CM4PLUS';

const VALID_CALL_TYPES = new Set<string>([
  'all',
  'incoming',
  'outgoing',
  'tandem',
  'internal',
  'ineffective',
]);

function extractCdrFilter(query: Record<string, unknown>): CdrQueryFilter {
  const getStr = (k: string): string | undefined => {
    const val = query[k];
    return typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined;
  };

  const rawCallType = getStr('call_type');
  const call_type =
    rawCallType && VALID_CALL_TYPES.has(rawCallType)
      ? (rawCallType as CdrCallType | 'all')
      : 'all';

  return {
    from: getStr('from'),
    to: getStr('to'),
    calling_number: getStr('calling_number'),
    called_number: getStr('called_number'),
    trunk_group: getStr('trunk_group'),
    call_type,
    station: getStr('station'),
    search: getStr('search'),
    sortBy: (getStr('sortBy') as CdrQueryFilter['sortBy']) || 'call_start_time',
    sortDir: getStr('sortDir') === 'asc' ? 'asc' : 'desc',
    page: getStr('page') ? Number.parseInt(getStr('page')!, 10) : 1,
    page_size: getStr('page_size') ? Number.parseInt(getStr('page_size')!, 10) : 25,
  };
}

function isValidBindHost(host: string): boolean {
  if (!host || host.length > 64) return false;
  return /^[a-zA-Z0-9.:_-]+$/.test(host);
}

function isValidIpAllowlist(input: string): boolean {
  if (!input.trim()) return true;
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.every((ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[a-fA-F0-9:]+$/.test(ip));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(logAccess);

  // Start listen-only Avaya CDR Adjunct TCP/UDP Service using env defaults (no startup DB probe)
  const cdrListener = new CdrListenerService({
    host: DEFAULT_LISTEN_HOST,
    port: DEFAULT_LISTEN_PORT,
    protocol: DEFAULT_PROTOCOL,
    formatProfile: DEFAULT_FORMAT_PROFILE,
    cmSourceIp: '',
    cmNodeName: 'procr',
    enabled: true,
  });
  void cdrListener.start();

  let settingsSyncedOnce = false;
  async function syncPersistedSettingsIfPresent(): Promise<CdrConnectionConfigDto> {
    if (!settingsSyncedOnce) {
      settingsSyncedOnce = true;
      try {
        const stored = await getStoredConnectionSettings();
        if (stored) {
          const cur = cdrListener.getConfig();
          const differs =
            cur.host !== stored.listenHost ||
            cur.port !== stored.listenPort ||
            cur.protocol !== stored.protocol ||
            cur.formatProfile !== stored.formatProfile ||
            cur.cmSourceIp !== stored.cmSourceIp ||
            cur.cmNodeName !== stored.cmNodeName ||
            cur.enabled !== stored.enabled;

          if (differs) {
            await cdrListener.reconfigure({
              host: stored.listenHost,
              port: stored.listenPort,
              protocol: stored.protocol,
              formatProfile: stored.formatProfile,
              cmSourceIp: stored.cmSourceIp,
              cmNodeName: stored.cmNodeName,
              enabled: stored.enabled,
            });
          }
          return {
            listenHost: stored.listenHost,
            listenPort: stored.listenPort,
            protocol: stored.protocol,
            formatProfile: stored.formatProfile,
            cmSourceIp: stored.cmSourceIp,
            cmNodeName: stored.cmNodeName,
            enabled: stored.enabled,
            isListening: cdrListener.isListening(),
            githubRepo: stored.githubRepo || process.env.GITHUB_REPO || '',
            githubBranch: stored.githubBranch || process.env.GITHUB_BRANCH || 'main',
            updatedAt: stored.updatedAt,
          };
        }
      } catch (err) {
        logError('Unable to sync stored cdr_settings; using active listener config', err);
      }
    }

    const active = cdrListener.getConfig();
    return {
      listenHost: active.host,
      listenPort: active.port,
      protocol: active.protocol,
      formatProfile: active.formatProfile,
      cmSourceIp: active.cmSourceIp,
      cmNodeName: active.cmNodeName,
      enabled: active.enabled,
      isListening: cdrListener.isListening(),
      githubRepo: process.env.GITHUB_REPO || '',
      githubBranch: process.env.GITHUB_BRANCH || 'main',
    };
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'avaya-cm-cdr-server',
    });
  });

  app.get('/api/config/info', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const connection = await syncPersistedSettingsIfPresent();
      res.json({
        connection,
        profiles: Object.values(CDR_FORMAT_PROFILES).map((p) => ({
          name: p.name,
          description: p.description,
          minLineLength: p.minLineLength,
          fields: p.fields,
        })),
      });
    } catch (error) {
      logError('GET /api/config/info failed', error);
      res.status(500).json({ error: 'Không thể tải cấu hình hệ thống.' });
    }
  });

  // GET /api/config/connection — Retrieve current CDR connection parameters
  app.get('/api/config/connection', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const connection = await syncPersistedSettingsIfPresent();
      res.json({ connection });
    } catch (error) {
      logError('GET /api/config/connection failed', error);
      res.status(500).json({ error: 'Không thể tải cấu hình kết nối CDR.' });
    }
  });

  // PUT /api/config/connection — Validate, persist in PostgreSQL, and hot-reload CDR Listener
  app.put('/api/config/connection', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body || {};
      const listenHost =
        typeof body.listenHost === 'string' && body.listenHost.trim()
          ? body.listenHost.trim()
          : '0.0.0.0';
      const listenPort = Number.parseInt(String(body.listenPort ?? ''), 10);
      const protocolRaw = typeof body.protocol === 'string' ? body.protocol.toUpperCase() : 'TCP';
      const profileRaw =
        typeof body.formatProfile === 'string' ? body.formatProfile.toUpperCase() : 'CM4PLUS';
      const cmSourceIp = typeof body.cmSourceIp === 'string' ? body.cmSourceIp.trim() : '';
      const cmNodeName =
        typeof body.cmNodeName === 'string' && body.cmNodeName.trim()
          ? body.cmNodeName.trim().slice(0, 64)
          : 'procr';
      const enabled = body.enabled !== false;

      if (!isValidBindHost(listenHost)) {
        res.status(400).json({ error: 'Địa chỉ Bind IP / Host không hợp lệ.' });
        return;
      }
      if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) {
        res.status(400).json({ error: 'Cổng lắng nghe (Listen Port) phải nằm trong khoảng 1024 - 65535.' });
        return;
      }
      if (listenPort === WEB_PORT) {
        res.status(400).json({
          error: `Cổng ${WEB_PORT} đang dùng cho Web Server, vui lòng chọn cổng khác cho CDR Listener (VD: 5000).`,
        });
        return;
      }
      if (protocolRaw !== 'TCP' && protocolRaw !== 'UDP' && protocolRaw !== 'BOTH') {
        res.status(400).json({ error: 'Giao thức chỉ hỗ trợ TCP, UDP hoặc BOTH.' });
        return;
      }
      if (!(profileRaw in CDR_FORMAT_PROFILES)) {
        res.status(400).json({ error: 'Format Profile chỉ hỗ trợ CM4PLUS, LEGACY hoặc UNFORMATTED.' });
        return;
      }
      if (!isValidIpAllowlist(cmSourceIp)) {
        res.status(400).json({
          error: 'IP tổng đài Avaya CM không hợp lệ (hỗ trợ danh sách IPv4 cách nhau bởi dấu phẩy).',
        });
        return;
      }

      const protocol = protocolRaw as CdrProtocol;
      const formatProfile = profileRaw as CdrFormatProfile;

      const saved = await saveConnectionSettings({
        listenHost,
        listenPort,
        protocol,
        formatProfile,
        cmSourceIp,
        cmNodeName,
        enabled,
        updatedBy: req.user?.email || req.user?.uid || 'admin',
      });
      settingsSyncedOnce = true;

      await cdrListener.reconfigure({
        host: saved.listenHost,
        port: saved.listenPort,
        protocol: saved.protocol,
        formatProfile: saved.formatProfile,
        cmSourceIp: saved.cmSourceIp,
        cmNodeName: saved.cmNodeName,
        enabled: saved.enabled,
      });

      const connection: CdrConnectionConfigDto = {
        ...saved,
        isListening: cdrListener.isListening(),
      };

      res.json({ connection });
    } catch (error) {
      logError('PUT /api/config/connection failed', error);
      res.status(500).json({ error: 'Không thể lưu và áp dụng cấu hình kết nối CDR.' });
    }
  });

  // GET /api/system/update/status — Current local version and git state (repo URL kept server-side)
  app.get('/api/system/update/status', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const gitInfo = await getLocalGitInfo();
      res.json({
        currentVersion: readPackageVersion(),
        githubBranch: gitInfo.currentBranch || FIXED_GITHUB_BRANCH,
        isGitRepo: gitInfo.isGitRepo,
        localCommit: gitInfo.localCommit,
      });
    } catch (error) {
      logError('GET /api/system/update/status failed', error);
      res.status(500).json({ error: 'Không thể đọc trạng thái phiên bản hiện tại.' });
    }
  });

  // POST /api/system/update/check — Query fixed GitHub repo Releases / commit and compare with local version
  app.post('/api/system/update/check', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const result = await checkGitHubUpdate(FIXED_GITHUB_REPO);
      res.json(result);
    } catch (error) {
      logError('POST /api/system/update/check failed', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Không thể kiểm tra phiên bản trên GitHub.',
      });
    }
  });

  // POST /api/system/update/apply — Pull from fixed GitHub repo, install prod deps, rebuild frontend
  app.post('/api/system/update/apply', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const result = await applyGitHubUpdate(FIXED_GITHUB_REPO);
      res.json(result);
    } catch (error) {
      logError('POST /api/system/update/apply failed', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Cập nhật từ GitHub thất bại.',
      });
    }
  });

  // POST /api/system/restart — Trigger graceful shutdown so systemd/Docker supervisor restarts with new build
  app.post('/api/system/restart', requireAuth, async (_req: AuthRequest, res) => {
    res.json({ restarting: true });
    setTimeout(async () => {
      await cdrListener.stop();
      process.exit(0);
    }, 300);
  });

  // GET /api/cdr — Filtered, sorted, paginated CDR list
  app.get('/api/cdr', requireAuth, async (req: AuthRequest, res) => {
    try {
      const filter = extractCdrFilter(req.query as Record<string, unknown>);
      if (filter.from && Number.isNaN(new Date(filter.from).getTime())) {
        res.status(400).json({ error: 'Invalid "from" datetime parameter' });
        return;
      }
      if (filter.to && Number.isNaN(new Date(filter.to).getTime())) {
        res.status(400).json({ error: 'Invalid "to" datetime parameter' });
        return;
      }

      const data = await listCdrRecords(filter);
      res.json(data);
    } catch (error) {
      logError('GET /api/cdr failed', error);
      res.status(500).json({ error: 'Không thể tải danh sách bản ghi CDR.' });
    }
  });

  // GET /api/cdr/export — CSV export of filtered CDR records
  app.get('/api/cdr/export', requireAuth, async (req: AuthRequest, res) => {
    try {
      const filter = extractCdrFilter(req.query as Record<string, unknown>);
      const records = await exportCdrRecords(filter);

      const headers = [
        'ID',
        'Call_Start_Time',
        'Duration_Sec',
        'Calling_Number',
        'Called_Number',
        'Station',
        'Trunk_Group',
        'Call_Type',
        'Condition_Code',
        'Access_Code',
        'Account_Code',
        'UCID',
        'Format_Profile',
        'Raw_Record',
      ];

      const esc = (v: string | number | null) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const lines = [headers.join(',')];
      for (const r of records) {
        lines.push(
          [
            r.id,
            r.callStartTime,
            r.callDurationSec,
            r.callingNumber,
            r.calledNumber,
            r.station,
            r.trunkGroup,
            r.callType,
            r.conditionCode,
            r.accessCode,
            r.accountCode,
            r.ucid,
            r.formatProfile,
            r.rawRecord,
          ]
            .map(esc)
            .join(',')
        );
      }

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="avaya-cdr-${stamp}.csv"`);
      res.send('\uFEFF' + lines.join('\r\n'));
    } catch (error) {
      logError('GET /api/cdr/export failed', error);
      res.status(500).json({ error: 'Không thể xuất file CSV.' });
    }
  });

  // GET /api/cdr/:id — Single CDR detail including raw_record
  app.get('/api/cdr/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid CDR record ID' });
        return;
      }

      const record = await getCdrRecordById(id);
      if (!record) {
        res.status(404).json({ error: 'CDR record not found' });
        return;
      }
      res.json({ record });
    } catch (error) {
      logError('GET /api/cdr/:id failed', error);
      res.status(500).json({ error: 'Không thể lấy chi tiết bản ghi CDR.' });
    }
  });

  // POST /api/cdr/seed — Seed sample Avaya CM records
  app.post('/api/cdr/seed', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const active = cdrListener.getConfig();
      const count = await seedSampleAvayaRecords(active.formatProfile);
      res.status(201).json({ inserted: count });
    } catch (error) {
      logError('POST /api/cdr/seed failed', error);
      res.status(500).json({ error: 'Không thể nạp dữ liệu mẫu.' });
    }
  });

  // POST /api/cdr/test-tcp — Send a real Avaya CDR line over TCP to the active CDR Listener port
  app.post('/api/cdr/test-tcp', requireAuth, async (req: AuthRequest, res) => {
    try {
      await syncPersistedSettingsIfPresent();
      const active = cdrListener.getConfig();
      if (!active.enabled) {
        res.status(400).json({
          error: 'Dịch vụ CDR Listener đang tắt. Vui lòng bật trong mục Cấu hình kết nối trước khi gửi thử.',
        });
        return;
      }
      if (active.protocol === 'UDP') {
        res.status(400).json({
          error: 'CDR Listener đang chạy ở chế độ chỉ UDP. Chuyển sang TCP hoặc BOTH để kiểm thử TCP.',
        });
        return;
      }

      const profileInput =
        typeof req.body?.profile === 'string'
          ? (req.body.profile.toUpperCase() as CdrFormatProfile)
          : active.formatProfile;
      const profile: CdrFormatProfile =
        profileInput in CDR_FORMAT_PROFILES ? profileInput : active.formatProfile;

      const scenarios = [
        { cond: '9', tac: '801', dialed: '3001', calling: '0903451289', durTenths: 28, acct: 'INB101', tg: '0001', stn: '3001' },
        { cond: '0', tac: '802', dialed: '90987654321', calling: '2101', durTenths: 45, acct: 'OUT202', tg: '0002', stn: '2101' },
        { cond: 'E', tac: '803', dialed: '902838221045', calling: '0938112299', durTenths: 16, acct: 'TDM303', tg: '0003', stn: '' },
        { cond: '4', tac: '801', dialed: '90912883401', calling: '2102', durTenths: 0, acct: '', tg: '0001', stn: '2102' },
      ];
      const pick = scenarios[Math.floor(Math.random() * scenarios.length)];
      const rawLine = buildFixedWidthCdrLine({
        profile,
        date: new Date(),
        durationTenths: pick.durTenths,
        conditionCode: pick.cond,
        accessCode: pick.tac,
        dialedNumber: pick.dialed,
        callingNumber: pick.calling,
        accountCode: pick.acct,
        trunkGroup: pick.tg,
        station: pick.stn,
        ucid: `00001${Date.now().toString(16).padStart(15, '0')}`.slice(0, 20),
      });

      await new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ host: '127.0.0.1', port: active.port }, () => {
          client.write(`${rawLine}\n`, 'utf8', () => {
            client.end();
            resolve();
          });
        });
        client.on('error', reject);
        client.setTimeout(3000, () => {
          client.destroy();
          reject(new Error('TCP listener timeout'));
        });
      });

      await new Promise((r) => setTimeout(r, 150));

      res.status(201).json({
        sentOverTcp: true,
        port: active.port,
        profile,
        rawLine,
      });
    } catch (error) {
      logError('POST /api/cdr/test-tcp failed', error);
      res.status(500).json({ error: 'Không thể gửi gói CDR qua TCP tới Listener.' });
    }
  });

  // POST /api/cdr/import — Parse & optionally store raw Avaya CDR lines
  app.post('/api/cdr/import', requireAuth, async (req: AuthRequest, res) => {
    try {
      const active = cdrListener.getConfig();
      const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText : '';
      const dryRun = Boolean(req.body?.dryRun);
      const profileRaw =
        typeof req.body?.profile === 'string'
          ? (req.body.profile.toUpperCase() as CdrFormatProfile)
          : active.formatProfile;
      const profile: CdrFormatProfile =
        profileRaw in CDR_FORMAT_PROFILES ? profileRaw : active.formatProfile;

      if (!rawText.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập nội dung bản ghi CDR thô.' });
        return;
      }

      const parser = new CdrParser(profile);
      const lines = rawText
        .split(/\r?\n/)
        .map((l: string) => l.replace(/\r/g, ''))
        .filter((l: string) => l.trim().length > 0);

      const preview: Array<ReturnType<CdrParser['parseLine']>> = [];
      const errors: Array<{ lineNumber: number; line: string; reason: string }> = [];

      lines.forEach((line: string, idx: number) => {
        try {
          preview.push(parser.parseLine(line, profile));
        } catch (err) {
          errors.push({
            lineNumber: idx + 1,
            line,
            reason: err instanceof Error ? err.message : 'Lỗi phân tích định dạng CDR',
          });
        }
      });

      let addedCount = 0;
      if (!dryRun) {
        for (const item of preview) {
          await insertCdrRecord(item);
          addedCount += 1;
        }
      }

      res.json({
        dryRun,
        profile,
        parsedCount: preview.length,
        addedCount,
        errorCount: errors.length,
        errors,
        preview: preview.slice(0, 50),
      });
    } catch (error) {
      logError('POST /api/cdr/import failed', error);
      res.status(500).json({ error: 'Không thể phân tích dữ liệu CDR.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(WEB_PORT, '0.0.0.0', () => {
    console.log(`Avaya CDR Web Server listening on http://0.0.0.0:${WEB_PORT}`);
  });
}

startServer();
