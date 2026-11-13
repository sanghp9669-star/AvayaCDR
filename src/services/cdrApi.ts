import type {
  CdrConnectionConfigDto,
  CdrFormatProfile,
  CdrListResponse,
  CdrProtocol,
  CdrQueryFilter,
  CdrRecordDto,
  UpdateApplyResult,
  UpdateCheckResult,
} from '../../shared/cdrTypes';

function buildQueryParams(filter: CdrQueryFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.calling_number) params.set('calling_number', filter.calling_number);
  if (filter.called_number) params.set('called_number', filter.called_number);
  if (filter.trunk_group && filter.trunk_group !== 'all') {
    params.set('trunk_group', filter.trunk_group);
  }
  if (filter.call_type && filter.call_type !== 'all') {
    params.set('call_type', filter.call_type);
  }
  if (filter.station) params.set('station', filter.station);
  if (filter.search) params.set('search', filter.search);
  if (filter.sortBy) params.set('sortBy', filter.sortBy);
  if (filter.sortDir) params.set('sortDir', filter.sortDir);
  if (filter.page) params.set('page', String(filter.page));
  if (filter.page_size) params.set('page_size', String(filter.page_size));
  return params.toString();
}

export async function fetchCdrList(
  token: string,
  filter: CdrQueryFilter
): Promise<CdrListResponse> {
  const qs = buildQueryParams(filter);
  const res = await fetch(`/api/cdr?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải danh sách CDR.');
  }
  return data;
}

export async function fetchCdrDetail(token: string, id: number): Promise<CdrRecordDto> {
  const res = await fetch(`/api/cdr/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải chi tiết bản ghi CDR.');
  }
  return data.record;
}

export async function downloadCdrCsv(token: string, filter: CdrQueryFilter): Promise<void> {
  const qs = buildQueryParams(filter);
  const res = await fetch(`/api/cdr/export?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Không thể xuất tệp CSV.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `avaya-cdr-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function seedSampleCdrs(token: string): Promise<{ inserted: number }> {
  const res = await fetch('/api/cdr/seed', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể nạp dữ liệu mẫu.');
  }
  return data;
}

export async function triggerTcpTestCall(
  token: string,
  profile?: CdrFormatProfile
): Promise<{ sentOverTcp: boolean; port: number; profile: CdrFormatProfile; rawLine: string }> {
  const res = await fetch('/api/cdr/test-tcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể gửi gói CDR qua TCP.');
  }
  return data;
}

export interface ImportCdrResult {
  dryRun: boolean;
  profile: CdrFormatProfile;
  parsedCount: number;
  addedCount: number;
  errorCount: number;
  errors: Array<{ lineNumber: number; line: string; reason: string }>;
  preview: Array<{
    callStartTime: string;
    callDurationSec: number;
    callingNumber: string;
    calledNumber: string;
    trunkGroup: string;
    station: string | null;
    callType: string;
    conditionCode: string;
    ucid: string | null;
  }>;
}

export async function importRawCdrLines(
  token: string,
  rawText: string,
  profile: CdrFormatProfile,
  dryRun: boolean
): Promise<ImportCdrResult> {
  const res = await fetch('/api/cdr/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rawText, profile, dryRun }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Lỗi khi phân tích dữ liệu CDR.');
  }
  return data;
}

export interface ListenerConfigInfo {
  connection: CdrConnectionConfigDto;
  profiles: Array<{
    name: CdrFormatProfile;
    description: string;
    minLineLength: number;
    fields: Record<string, { start: number; length: number; description: string }>;
  }>;
}

export async function fetchConfigInfo(token: string): Promise<ListenerConfigInfo> {
  const res = await fetch('/api/config/info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải cấu hình listener.');
  }
  return data;
}

export interface UpdateConnectionConfigInput {
  listenHost: string;
  listenPort: number;
  protocol: CdrProtocol;
  formatProfile: CdrFormatProfile;
  cmSourceIp: string;
  cmNodeName: string;
  enabled: boolean;
}

export async function updateConnectionConfig(
  token: string,
  input: UpdateConnectionConfigInput
): Promise<CdrConnectionConfigDto> {
  const res = await fetch('/api/config/connection', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu cấu hình kết nối.');
  }
  return data.connection;
}

export interface LocalUpdateStatus {
  currentVersion: string;
  githubBranch: string;
  isGitRepo: boolean;
  localCommit: string | null;
}

export async function fetchUpdateStatus(token: string): Promise<LocalUpdateStatus> {
  const res = await fetch('/api/system/update/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải trạng thái phiên bản.');
  }
  return data;
}

export async function checkGitHubUpdateApi(token: string): Promise<UpdateCheckResult> {
  const res = await fetch('/api/system/update/check', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể kiểm tra phiên bản trên GitHub.');
  }
  return data;
}

export async function applyGitHubUpdateApi(token: string): Promise<UpdateApplyResult> {
  const res = await fetch('/api/system/update/apply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Cập nhật từ GitHub thất bại.');
  }
  return data;
}

export async function restartServerApi(token: string): Promise<{ restarting: boolean }> {
  const res = await fetch('/api/system/restart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Không thể khởi động lại dịch vụ.');
  }
  return data;
}
