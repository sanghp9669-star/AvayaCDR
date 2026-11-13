export type CdrFormatProfile = 'LEGACY' | 'CM4PLUS' | 'UNFORMATTED';

export type CdrProtocol = 'TCP' | 'UDP' | 'BOTH';

export type CdrCallType = 'incoming' | 'outgoing' | 'tandem' | 'internal' | 'ineffective';

export interface CdrConnectionConfigDto {
  listenHost: string;
  listenPort: number;
  protocol: CdrProtocol;
  formatProfile: CdrFormatProfile;
  cmSourceIp: string;
  cmNodeName: string;
  enabled: boolean;
  isListening: boolean;
  githubRepo: string;
  githubBranch: string;
  updatedAt?: string;
}

export interface UpdateCheckResult {
  repo: string;
  branch: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  source: 'release' | 'package_json';
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  localCommit: string | null;
  remoteCommit: string | null;
  isGitRepo: boolean;
  checkedAt: string;
}

export interface UpdateStepResult {
  step: string;
  ok: boolean;
  output: string;
}

export interface UpdateApplyResult {
  updated: boolean;
  previousVersion: string;
  newVersion: string;
  restartRequired: boolean;
  steps: UpdateStepResult[];
  completedAt: string;
}

export interface CdrRecordDto {
  id: number;
  callStartTime: string;
  callDurationSec: number;
  callingNumber: string;
  calledNumber: string;
  trunkGroup: string;
  station: string | null;
  callType: CdrCallType;
  conditionCode: string;
  accessCode: string | null;
  accountCode: string | null;
  ucid: string | null;
  formatProfile: CdrFormatProfile;
  rawRecord: string;
  createdAt: string;
}

export interface CdrQueryFilter {
  from?: string;
  to?: string;
  calling_number?: string;
  called_number?: string;
  trunk_group?: string;
  call_type?: CdrCallType | 'all';
  station?: string;
  search?: string;
  sortBy?: 'call_start_time' | 'call_duration_sec' | 'calling_number' | 'called_number' | 'call_type';
  sortDir?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface CdrSummaryStats {
  totalCalls: number;
  totalDurationSec: number;
  avgDurationSec: number;
  incomingCount: number;
  outgoingCount: number;
  tandemCount: number;
  internalCount: number;
  ineffectiveCount: number;
}

export interface CdrListResponse {
  records: CdrRecordDto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: CdrSummaryStats;
}

export interface AvayaConditionMeta {
  code: string;
  meaning: string;
  viDescription: string;
  isIneffective: boolean;
}

export const AVAYA_CONDITION_TABLE: AvayaConditionMeta[] = [
  {
    code: '0',
    meaning: 'Normal Outgoing / Internal Call',
    viDescription: 'Cuộc gọi ra ngoài hoặc nội bộ kết nối thành công',
    isIneffective: false,
  },
  {
    code: '1',
    meaning: 'Attendant Assisted Call',
    viDescription: 'Cuộc gọi qua bàn trực tổng đài viên (Attendant)',
    isIneffective: false,
  },
  {
    code: '4',
    meaning: 'Ring No Answer / Ineffective Attempt',
    viDescription: 'Đổ chuông nhưng không trả lời (Ineffective Call Attempt)',
    isIneffective: true,
  },
  {
    code: '7',
    meaning: 'Busy / Trunk Congestion',
    viDescription: 'Thuê bao bận hoặc nghẽn trung kế (Ineffective)',
    isIneffective: true,
  },
  {
    code: '8',
    meaning: 'Abandoned Call',
    viDescription: 'Người gọi cúp máy trước khi kết nối',
    isIneffective: true,
  },
  {
    code: '9',
    meaning: 'Incoming Trunk Call Answered',
    viDescription: 'Cuộc gọi vào từ trung kế đã được trả lời',
    isIneffective: false,
  },
  {
    code: 'A',
    meaning: 'Station-to-Station / Normal Answered',
    viDescription: 'Cuộc gọi nội bộ giữa các máy nhánh hoặc cuộc gọi chuẩn',
    isIneffective: false,
  },
  {
    code: 'B',
    meaning: 'Toll Restricted / COR Denied',
    viDescription: 'Bị chặn bởi phân quyền COR / FRL (Ineffective)',
    isIneffective: true,
  },
  {
    code: 'C',
    meaning: 'Conference / Tandem Bridge',
    viDescription: 'Cuộc gọi hội nghị hoặc chuyển tiếp qua trung kế',
    isIneffective: false,
  },
  {
    code: 'E',
    meaning: 'Tandem / Trunk-to-Trunk Transfer',
    viDescription: 'Cuộc gọi Tandem (Trunk-to-Trunk) hoặc chuyển tiếp',
    isIneffective: false,
  },
  {
    code: 'G',
    meaning: 'Network / Trunk Failure',
    viDescription: 'Lỗi kết nối đường trung kế / nhà mạng',
    isIneffective: true,
  },
];

export const CALL_TYPE_LABELS: Record<CdrCallType, string> = {
  incoming: 'Gọi vào (Incoming)',
  outgoing: 'Gọi ra (Outgoing)',
  tandem: 'Chuyển tiếp (Tandem)',
  internal: 'Nội bộ (Internal)',
  ineffective: 'Không thành công (Ineffective)',
};
