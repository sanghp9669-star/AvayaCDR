import type { CdrCallType, CdrFormatProfile } from '../shared/cdrTypes.ts';

/**
 * Avaya Aura Communication Manager (CM) Legacy CDR Parser
 * Reference: "Call Detail Recording" in Avaya Aura CM Feature Description and Implementation (R10.3.x)
 *
 * CM emits one ASCII line per call record over IP (CDR1 / CDR2 service in `change ip-services`)
 * in listen-only adjunct mode. Each format profile defines fixed positional character slices
 * (0-indexed [start, start + length)) or token rules so new CM customized layouts can be added easily.
 */

export interface PositionalFieldSpec {
  start: number;
  length: number;
  description: string;
}

export interface CdrProfileDefinition {
  name: CdrFormatProfile;
  description: string;
  minLineLength: number;
  fields: {
    date: PositionalFieldSpec; // MMDDYY (6) or MMDD (4)
    time: PositionalFieldSpec; // HHMM (4)
    duration: PositionalFieldSpec; // HHHHM (4 or 5: minutes + tenths of minute)
    conditionCode: PositionalFieldSpec; // 1 char
    accessCode: PositionalFieldSpec; // Dialed TAC / Feature code (4 chars)
    dialedNumber: PositionalFieldSpec; // Called party number (15 or 18 chars)
    callingNumber: PositionalFieldSpec; // Calling party number (10 or 15 chars)
    accountCode?: PositionalFieldSpec; // Optional Account Code (6-15 chars)
    trunkGroup?: PositionalFieldSpec; // Optional Trunk Group ID (3-4 chars)
    station?: PositionalFieldSpec; // Optional Station / Extension (4-6 chars)
    ucid?: PositionalFieldSpec; // Optional 20-char hex Universal Call ID
  };
}

/**
 * Registry of supported Avaya CM CDR Format Profiles.
 * Adding a new customized CDR layout only requires adding an entry here.
 */
export const CDR_FORMAT_PROFILES: Record<CdrFormatProfile, CdrProfileDefinition> = {
  /**
   * LEGACY (Classic Avaya Definity / CM R1.x-R3.x Fixed-Width 59-char Unformatted CDR):
   * Pos  0..5  (6): Date MMDDYY
   * Pos  6..9  (4): Start Time HHMM
   * Pos 10..13 (4): Duration HHH T (hours/minutes in tenths, e.g. 0015 = 1.5 min = 90s)
   * Pos 14..14 (1): Condition Code (0, 4, 7, 8, 9, A, B, C, E, G)
   * Pos 15..18 (4): Access Code / TAC (space-padded)
   * Pos 19..33 (15): Dialed / Called Number
   * Pos 34..43 (10): Calling Number
   * Pos 44..49 (6): Account Code
   * Pos 50..53 (4): Trunk Group (optional extension)
   */
  LEGACY: {
    name: 'LEGACY',
    description: 'Avaya Legacy Fixed-Width Unformatted CDR (54+ bytes)',
    minLineLength: 44,
    fields: {
      date: { start: 0, length: 6, description: 'MMDDYY call date' },
      time: { start: 6, length: 4, description: 'HHMM call start time' },
      duration: { start: 10, length: 4, description: 'MMMT duration (tenths of a minute)' },
      conditionCode: { start: 14, length: 1, description: 'Avaya Condition Code' },
      accessCode: { start: 15, length: 4, description: 'TAC / Access Code' },
      dialedNumber: { start: 19, length: 15, description: 'Dialed / Called Number' },
      callingNumber: { start: 34, length: 10, description: 'Calling Number' },
      accountCode: { start: 44, length: 6, description: 'Account Code' },
      trunkGroup: { start: 50, length: 4, description: 'Trunk Group' },
    },
  },

  /**
   * CM4PLUS (Avaya Aura CM 4.x - R10.3.x Expanded Fixed-Width CDR - 89 bytes):
   * Pos  0..5  (6): Date MMDDYY
   * Pos  6..9  (4): Start Time HHMM
   * Pos 10..14 (5): Duration HHHHT (tenths of a minute, e.g. 00042 = 4.2 min = 252s)
   * Pos 15..15 (1): Condition Code
   * Pos 16..19 (4): Access Code / TAC (e.g. 801, 802)
   * Pos 20..37 (18): Dialed / Called Number
   * Pos 38..52 (15): Calling Number
   * Pos 53..60 (8): Account Code
   * Pos 61..64 (4): Trunk Group (e.g. TG01 or 0001)
   * Pos 65..69 (5): Primary Station / Extension
   * Pos 70..89 (20): UCID (20-char hex Universal Call ID)
   */
  CM4PLUS: {
    name: 'CM4PLUS',
    description: 'Avaya Aura CM 4.x–R10.3.x Expanded CDR with UCID & Trunk Group (90 bytes)',
    minLineLength: 53,
    fields: {
      date: { start: 0, length: 6, description: 'MMDDYY call date' },
      time: { start: 6, length: 4, description: 'HHMM call start time' },
      duration: { start: 10, length: 5, description: 'MMMMT duration (tenths of a minute)' },
      conditionCode: { start: 15, length: 1, description: 'Avaya Condition Code' },
      accessCode: { start: 16, length: 4, description: 'TAC / Access Code' },
      dialedNumber: { start: 20, length: 18, description: 'Dialed / Called Number' },
      callingNumber: { start: 38, length: 15, description: 'Calling Number' },
      accountCode: { start: 53, length: 8, description: 'Account Code' },
      trunkGroup: { start: 61, length: 4, description: 'Trunk Group' },
      station: { start: 65, length: 5, description: 'Primary Extension / Station' },
      ucid: { start: 70, length: 20, description: 'Universal Call ID (UCID)' },
    },
  },

  /**
   * UNFORMATTED (Space-delimited Avaya CDR / Customized IP stream):
   * Tokens: MMDDYY HHMM DDDDD COND TAC DIALED CALLING [ACCT] [TRUNK] [UCID]
   */
  UNFORMATTED: {
    name: 'UNFORMATTED',
    description: 'Space-delimited Avaya Unformatted CDR stream',
    minLineLength: 20,
    fields: {
      date: { start: 0, length: 6, description: 'Token 0: MMDDYY' },
      time: { start: 0, length: 4, description: 'Token 1: HHMM' },
      duration: { start: 0, length: 5, description: 'Token 2: MMMMT' },
      conditionCode: { start: 0, length: 1, description: 'Token 3: Condition Code' },
      accessCode: { start: 0, length: 4, description: 'Token 4: TAC' },
      dialedNumber: { start: 0, length: 18, description: 'Token 5: Dialed' },
      callingNumber: { start: 0, length: 15, description: 'Token 6: Calling' },
    },
  },
};

export interface ParsedCdrRecord {
  callStartTime: Date;
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
}

const INEFFECTIVE_CONDITION_CODES = new Set(['4', '7', '8', 'B', 'G', 'I']);

function sliceField(line: string, spec?: PositionalFieldSpec): string {
  if (!spec) return '';
  if (line.length <= spec.start) return '';
  return line.slice(spec.start, spec.start + spec.length).trim();
}

function sanitizePrintable(value: string, maxLen = 32): string {
  return value.replace(/[^\w\-+.*#]/g, '').trim().slice(0, maxLen);
}

/**
 * Parses Avaya MMDDYY + HHMM into a valid Date.
 */
function parseAvayaDateTime(dateStr: string, timeStr: string): Date {
  if (!/^\d{6}$/.test(dateStr) || !/^\d{4}$/.test(timeStr)) {
    throw new Error(`Invalid Avaya date/time tokens: "${dateStr}" "${timeStr}"`);
  }
  const month = Number.parseInt(dateStr.slice(0, 2), 10);
  const day = Number.parseInt(dateStr.slice(2, 4), 10);
  const year = 2000 + Number.parseInt(dateStr.slice(4, 6), 10);
  const hour = Number.parseInt(timeStr.slice(0, 2), 10);
  const minute = Number.parseInt(timeStr.slice(2, 4), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error(`Out-of-range Avaya date/time: ${dateStr} ${timeStr}`);
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Avaya CM Legacy CDR encodes duration in tenths of a minute (e.g. "0015" = 1.5 min = 90 sec).
 * If the string uses HHMM format or seconds suffix (in customized profiles), we handle tenths cleanly.
 */
function parseAvayaTenthsDuration(rawDuration: string): number {
  const cleaned = rawDuration.replace(/\D/g, '');
  if (!cleaned) return 0;
  const totalTenths = Number.parseInt(cleaned, 10);
  if (Number.isNaN(totalTenths) || totalTenths < 0) return 0;
  const wholeMinutes = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  return wholeMinutes * 60 + tenths * 6;
}

function isInternalExtension(num: string): boolean {
  return /^\d{3,5}$/.test(num);
}

function classifyCallType(params: {
  conditionCode: string;
  callingNumber: string;
  calledNumber: string;
  accessCode: string;
  trunkGroup: string;
}): CdrCallType {
  const cond = params.conditionCode.toUpperCase();
  if (INEFFECTIVE_CONDITION_CODES.has(cond)) {
    return 'ineffective';
  }

  const callingExt = isInternalExtension(params.callingNumber);
  const calledExt = isInternalExtension(params.calledNumber);
  const hasTrunk = Boolean(params.accessCode || (params.trunkGroup && params.trunkGroup !== '-'));

  // Tandem: Condition E/C/T with external-to-external or trunk-to-trunk routing
  if ((cond === 'E' || cond === 'T') && (!callingExt || !calledExt)) {
    return 'tandem';
  }
  if (!callingExt && !calledExt && hasTrunk) {
    return 'tandem';
  }

  // Incoming: Condition 9 or external calling -> internal extension
  if (cond === '9' || (!callingExt && calledExt)) {
    return 'incoming';
  }

  // Outgoing: Internal extension calling external number (often via TAC/trunk)
  if (callingExt && !calledExt) {
    return 'outgoing';
  }

  // Station-to-station internal
  if (callingExt && calledExt) {
    return 'internal';
  }

  return hasTrunk ? 'outgoing' : 'internal';
}

function deriveTrunkGroup(rawTrunk: string, accessCode: string): string {
  if (rawTrunk) {
    return rawTrunk.startsWith('TG') ? rawTrunk : `TG-${rawTrunk.replace(/^0+/, '') || rawTrunk}`;
  }
  if (accessCode === '801') return 'TG-1';
  if (accessCode === '802') return 'TG-2';
  if (accessCode === '803') return 'TG-3';
  if (accessCode) return `TG-${accessCode}`;
  return '-';
}

export class CdrParser {
  private profile: CdrFormatProfile;

  constructor(profile: CdrFormatProfile = 'CM4PLUS') {
    this.profile = profile in CDR_FORMAT_PROFILES ? profile : 'CM4PLUS';
  }

  public getProfile(): CdrFormatProfile {
    return this.profile;
  }

  public setProfile(profile: CdrFormatProfile): void {
    if (!(profile in CDR_FORMAT_PROFILES)) {
      throw new Error(`Unsupported CDR format profile: ${profile}`);
    }
    this.profile = profile;
  }

  /**
   * Parses a single raw Avaya CDR line according to the configured profile.
   * Automatically handles space-delimited lines when UNFORMATTED is chosen or when
   * incoming line clearly uses space-separated tokens.
   */
  public parseLine(rawLine: string, overrideProfile?: CdrFormatProfile): ParsedCdrRecord {
    const cleanRaw = rawLine.replace(/[\r\n]+/g, '');
    const trimmed = cleanRaw.trim();
    if (!trimmed) {
      throw new Error('Empty CDR line');
    }

    const activeProfile = overrideProfile || this.profile;

    // Check if space-delimited UNFORMATTED profile or space-separated token format
    if (activeProfile === 'UNFORMATTED' || /^\d{6}\s+\d{4}\s+\d{4,5}\s+[A-Za-z0-9]/.test(trimmed)) {
      return this.parseSpaceDelimited(trimmed, cleanRaw, activeProfile);
    }

    return this.parseFixedWidth(cleanRaw, activeProfile);
  }

  private parseFixedWidth(line: string, profileName: CdrFormatProfile): ParsedCdrRecord {
    const spec = CDR_FORMAT_PROFILES[profileName];
    if (line.length < spec.minLineLength) {
      throw new Error(
        `CDR line too short for profile ${profileName}: got ${line.length} chars, expected >= ${spec.minLineLength}`
      );
    }

    const dateStr = sliceField(line, spec.fields.date);
    const timeStr = sliceField(line, spec.fields.time);
    const durStr = sliceField(line, spec.fields.duration);
    const conditionCode = (sliceField(line, spec.fields.conditionCode) || '0').toUpperCase();
    const accessCode = sanitizePrintable(sliceField(line, spec.fields.accessCode), 16);
    const dialedRaw = sanitizePrintable(sliceField(line, spec.fields.dialedNumber), 32);
    const callingNumber = sanitizePrintable(sliceField(line, spec.fields.callingNumber), 32) || 'UNKNOWN';
    const accountCode = sanitizePrintable(sliceField(line, spec.fields.accountCode), 32) || null;
    const rawTrunk = sanitizePrintable(sliceField(line, spec.fields.trunkGroup), 16);
    const explicitStation = sanitizePrintable(sliceField(line, spec.fields.station), 16);
    const ucid = sanitizePrintable(sliceField(line, spec.fields.ucid), 32) || null;

    // Strip leading ARS/AAR dial-out prefix '9' if dialed number is external (>6 digits)
    const calledNumber =
      dialedRaw.startsWith('9') && dialedRaw.length > 6 ? dialedRaw.slice(1) : dialedRaw || 'UNKNOWN';

    const callStartTime = parseAvayaDateTime(dateStr, timeStr);
    const callDurationSec = parseAvayaTenthsDuration(durStr);
    const trunkGroup = deriveTrunkGroup(rawTrunk, accessCode);
    const callType = classifyCallType({
      conditionCode,
      callingNumber,
      calledNumber,
      accessCode,
      trunkGroup,
    });

    const station =
      explicitStation ||
      (isInternalExtension(callingNumber)
        ? callingNumber
        : isInternalExtension(calledNumber)
        ? calledNumber
        : null);

    return {
      callStartTime,
      callDurationSec,
      callingNumber,
      calledNumber,
      trunkGroup,
      station,
      callType,
      conditionCode,
      accessCode: accessCode || null,
      accountCode,
      ucid,
      formatProfile: profileName,
      rawRecord: line,
    };
  }

  private parseSpaceDelimited(
    trimmed: string,
    rawRecord: string,
    profileName: CdrFormatProfile
  ): ParsedCdrRecord {
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 6) {
      throw new Error(`Invalid space-delimited Avaya CDR line (expected >= 6 tokens, got ${tokens.length})`);
    }

    const dateStr = tokens[0];
    const timeStr = tokens[1];
    const durStr = tokens[2];
    const conditionCode = (tokens[3] || '0').toUpperCase();

    let accessCode = '';
    let dialedRaw = '';
    let callingNumber = '';
    let accountCode: string | null = null;
    let rawTrunk = '';
    let ucid: string | null = null;

    // Detect whether token[4] is a 3-4 digit TAC (e.g., 801) or directly the dialed number
    if (tokens.length >= 7 && /^\d{3,4}$/.test(tokens[4]) && tokens[4].startsWith('8')) {
      accessCode = sanitizePrintable(tokens[4], 16);
      dialedRaw = sanitizePrintable(tokens[5], 32);
      callingNumber = sanitizePrintable(tokens[6], 32);
      accountCode = tokens[7] && tokens[7] !== '-' ? sanitizePrintable(tokens[7], 32) : null;
      rawTrunk = tokens[8] && tokens[8] !== '-' ? sanitizePrintable(tokens[8], 16) : '';
      ucid = tokens[9] && tokens[9] !== '-' ? sanitizePrintable(tokens[9], 32) : null;
    } else {
      dialedRaw = sanitizePrintable(tokens[4], 32);
      callingNumber = sanitizePrintable(tokens[5], 32);
      accountCode = tokens[6] && tokens[6] !== '-' ? sanitizePrintable(tokens[6], 32) : null;
      rawTrunk = tokens[7] && tokens[7] !== '-' ? sanitizePrintable(tokens[7], 16) : '';
      ucid = tokens[8] && tokens[8] !== '-' ? sanitizePrintable(tokens[8], 32) : null;
    }

    const calledNumber =
      dialedRaw.startsWith('9') && dialedRaw.length > 6 ? dialedRaw.slice(1) : dialedRaw || 'UNKNOWN';
    const callStartTime = parseAvayaDateTime(dateStr, timeStr);
    const callDurationSec = parseAvayaTenthsDuration(durStr);
    const trunkGroup = deriveTrunkGroup(rawTrunk, accessCode);
    const callType = classifyCallType({
      conditionCode,
      callingNumber,
      calledNumber,
      accessCode,
      trunkGroup,
    });

    const station = isInternalExtension(callingNumber)
      ? callingNumber
      : isInternalExtension(calledNumber)
      ? calledNumber
      : null;

    return {
      callStartTime,
      callDurationSec,
      callingNumber,
      calledNumber,
      trunkGroup,
      station,
      callType,
      conditionCode,
      accessCode: accessCode || null,
      accountCode,
      ucid,
      formatProfile: profileName,
      rawRecord,
    };
  }
}

/**
 * Helper to generate authentic fixed-width CM4PLUS or LEGACY CDR lines for testing & TCP simulation.
 */
export function buildFixedWidthCdrLine(params: {
  profile: CdrFormatProfile;
  date: Date;
  durationTenths: number;
  conditionCode: string;
  accessCode: string;
  dialedNumber: string;
  callingNumber: string;
  accountCode?: string;
  trunkGroup?: string;
  station?: string;
  ucid?: string;
}): string {
  const mm = String(params.date.getMonth() + 1).padStart(2, '0');
  const dd = String(params.date.getDate()).padStart(2, '0');
  const yy = String(params.date.getFullYear()).slice(-2);
  const hh = String(params.date.getHours()).padStart(2, '0');
  const min = String(params.date.getMinutes()).padStart(2, '0');

  if (params.profile === 'LEGACY') {
    const dur = String(params.durationTenths).padStart(4, '0').slice(0, 4);
    const cond = (params.conditionCode || '0').slice(0, 1);
    const tac = (params.accessCode || '').padEnd(4, ' ').slice(0, 4);
    const dialed = params.dialedNumber.padEnd(15, ' ').slice(0, 15);
    const calling = params.callingNumber.padEnd(10, ' ').slice(0, 10);
    const acct = (params.accountCode || '').padEnd(6, ' ').slice(0, 6);
    const tg = (params.trunkGroup || '').padEnd(4, ' ').slice(0, 4);
    return `${mm}${dd}${yy}${hh}${min}${dur}${cond}${tac}${dialed}${calling}${acct}${tg}`;
  }

  if (params.profile === 'UNFORMATTED') {
    const dur = String(params.durationTenths).padStart(5, '0');
    const tac = params.accessCode || '801';
    const acct = params.accountCode || '-';
    const tg = params.trunkGroup || '1';
    const ucid = params.ucid || '00001000011731458290';
    return `${mm}${dd}${yy} ${hh}${min} ${dur} ${params.conditionCode} ${tac} ${params.dialedNumber} ${params.callingNumber} ${acct} ${tg} ${ucid}`;
  }

  // CM4PLUS (90 chars fixed width)
  const dur = String(params.durationTenths).padStart(5, '0').slice(0, 5);
  const cond = (params.conditionCode || '0').slice(0, 1);
  const tac = (params.accessCode || '').padEnd(4, ' ').slice(0, 4);
  const dialed = params.dialedNumber.padEnd(18, ' ').slice(0, 18);
  const calling = params.callingNumber.padEnd(15, ' ').slice(0, 15);
  const acct = (params.accountCode || '').padEnd(8, ' ').slice(0, 8);
  const tg = (params.trunkGroup || '').padEnd(4, ' ').slice(0, 4);
  const stn = (params.station || '').padEnd(5, ' ').slice(0, 5);
  const ucid = (params.ucid || '00001000011731458290').padEnd(20, '0').slice(0, 20);
  return `${mm}${dd}${yy}${hh}${min}${dur}${cond}${tac}${dialed}${calling}${acct}${tg}${stn}${ucid}`;
}
