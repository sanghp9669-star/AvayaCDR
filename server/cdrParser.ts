import {
  MAX_EXTENSION_LENGTH,
  type CdrCallType,
  type CdrFormatProfile,
} from '../shared/cdrTypes.ts';

/**
 * Avaya Aura Communication Manager (CM) Legacy CDR Parser
 * Reference: "Call Detail Recording" in Avaya Aura CM Feature Description and Implementation (R10.3.x)
 *
 * CM emits one ASCII line per call record over IP (CDR1 / CDR2 service in `change ip-services`)
 * in listen-only adjunct mode. Supports:
 * - CM4PLUS (90-byte fixed-width with UCID & Station)
 * - LEGACY (54-byte fixed-width Definity / CM R1-R3)
 * - Avaya Standard Time-First Unformatted (44-78 byte lines starting with HHMM + Dur + Cond)
 * - UNFORMATTED (space/tab/comma-delimited streams)
 * - Both MMDDYY (month/day) and DDMMYY (day/month) Avaya date formats
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
    date: PositionalFieldSpec; // MMDDYY (6) or DDMMYY (6)
    time: PositionalFieldSpec; // HHMM (4)
    duration: PositionalFieldSpec; // HHHHM (4 or 5: minutes + tenths of minute)
    conditionCode: PositionalFieldSpec; // 1 char
    accessCode: PositionalFieldSpec; // Dialed TAC / Feature code (4 chars)
    dialedNumber: PositionalFieldSpec; // Called party number (15 or 18 chars)
    callingNumber: PositionalFieldSpec; // Calling party number (10 or 15 chars)
    accountCode?: PositionalFieldSpec; // Optional Account Code (6-15 chars)
    trunkGroup?: PositionalFieldSpec; // Optional Trunk Group ID (3-4 chars)
    station?: PositionalFieldSpec; // Optional Station / Extension (max 4 chars)
    ucid?: PositionalFieldSpec; // Optional 20-char hex Universal Call ID
  };
}

export const CDR_FORMAT_PROFILES: Record<CdrFormatProfile, CdrProfileDefinition> = {
  LEGACY: {
    name: 'LEGACY',
    description: 'Avaya Legacy Fixed-Width Unformatted CDR (54+ bytes)',
    minLineLength: 44,
    fields: {
      date: { start: 0, length: 6, description: 'MMDDYY or DDMMYY call date' },
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

  CM4PLUS: {
    name: 'CM4PLUS',
    description: 'Avaya Aura CM 4.x–R10.3.x Expanded CDR with UCID & Trunk Group (90 bytes)',
    minLineLength: 53,
    fields: {
      date: { start: 0, length: 6, description: 'MMDDYY or DDMMYY call date' },
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

  UNFORMATTED: {
    name: 'UNFORMATTED',
    description: 'Space/delimiter-separated or Time-first 59-byte Avaya Unformatted CDR stream',
    minLineLength: 20,
    fields: {
      date: { start: 0, length: 6, description: 'Token 0: MMDDYY / DDMMYY / YYYYMMDD' },
      time: { start: 0, length: 4, description: 'Token 1: HHMM / HH:MM' },
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
 * Checks whether a standalone line from Avaya CM is a Date header banner
 * (e.g., "111426", "14/11/26", "11/14/2026") rather than a call record.
 */
export function tryParseDateHeaderLine(rawLine: string): Date | null {
  const clean = rawLine.replace(/[\r\n\0]+/g, '').trim();
  if (!clean || clean.length > 16) return null;

  if (/^\d{6}$/.test(clean)) {
    try {
      return parseAvayaDateOnly(clean);
    } catch {
      return null;
    }
  }

  const slash = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const p1 = Number.parseInt(slash[1], 10);
    const p2 = Number.parseInt(slash[2], 10);
    let yr = Number.parseInt(slash[3], 10);
    if (yr < 100) yr += 2000;
    const [month, day] = p1 > 12 ? [p2, p1] : [p1, p2];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(yr, month - 1, day, 0, 0, 0, 0);
    }
  }

  return null;
}

function parseAvayaDateOnly(dateStr: string): Date {
  const clean = dateStr.trim();

  if (/^\d{8}$/.test(clean)) {
    const year = Number.parseInt(clean.slice(0, 4), 10);
    const month = Number.parseInt(clean.slice(4, 6), 10);
    const day = Number.parseInt(clean.slice(6, 8), 10);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    throw new Error(`Out-of-range Avaya YYYYMMDD date: ${dateStr}`);
  }

  if (/^\d{6}$/.test(clean)) {
    const p1 = Number.parseInt(clean.slice(0, 2), 10);
    const p2 = Number.parseInt(clean.slice(2, 4), 10);
    const year = 2000 + Number.parseInt(clean.slice(4, 6), 10);

    // Support both MMDDYY (US/Avaya default) and DDMMYY (day/month used in Vietnam/EU)
    let month = p1;
    let day = p2;
    if (p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
      day = p1;
      month = p2;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Out-of-range Avaya date: ${dateStr}`);
    }
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  if (/^\d{4}$/.test(clean)) {
    const p1 = Number.parseInt(clean.slice(0, 2), 10);
    const p2 = Number.parseInt(clean.slice(2, 4), 10);
    const year = new Date().getFullYear();
    const [month, day] = p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12 ? [p2, p1] : [p1, p2];
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Out-of-range Avaya MMDD date: ${dateStr}`);
    }
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  const sep = clean.match(/^(\d{2,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (sep) {
    const a = Number.parseInt(sep[1], 10);
    const b = Number.parseInt(sep[2], 10);
    const c = Number.parseInt(sep[3], 10);
    if (sep[1].length === 4 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      return new Date(a, b - 1, c, 0, 0, 0, 0);
    }
    const year = c < 100 ? 2000 + c : c;
    const [month, day] = a > 12 ? [b, a] : [a, b];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }
  }

  throw new Error(`Invalid Avaya date token: "${dateStr}"`);
}

function parseAvayaTimeOnly(timeStr: string): { hour: number; minute: number; second: number } {
  const digits = timeStr.replace(/[:\s]/g, '');
  if (!/^\d{4}(\d{2})?$/.test(digits)) {
    throw new Error(`Invalid Avaya time token: "${timeStr}"`);
  }
  const hour = Number.parseInt(digits.slice(0, 2), 10);
  const minute = Number.parseInt(digits.slice(2, 4), 10);
  const second = digits.length === 6 ? Number.parseInt(digits.slice(4, 6), 10) : 0;
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Out-of-range Avaya time: ${timeStr}`);
  }
  return { hour, minute, second };
}

/**
 * Parses Avaya date (MMDDYY, DDMMYY, MMDD, YYYYMMDD) + time (HHMM, HHMMSS, HH:MM) into a Date.
 */
function parseAvayaDateTime(dateStr: string, timeStr: string): Date {
  if (!/^\d{4,8}$/.test(dateStr.trim()) && !/^\d{2,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(dateStr.trim())) {
    throw new Error(`Invalid Avaya date/time tokens: "${dateStr}" "${timeStr}"`);
  }
  const baseDate = parseAvayaDateOnly(dateStr);
  const { hour, minute, second } = parseAvayaTimeOnly(timeStr);
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    second,
    0
  );
}

/**
 * Avaya CM Legacy CDR encodes duration in tenths of a minute (e.g. "0015" = 1.5 min = 90 sec)
 * or optionally HH:MM:SS / MM:SS in customized streams.
 */
function parseAvayaDuration(rawDuration: string): number {
  const colonMatch = rawDuration.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    if (colonMatch[3] !== undefined) {
      return (
        Number.parseInt(colonMatch[1], 10) * 3600 +
        Number.parseInt(colonMatch[2], 10) * 60 +
        Number.parseInt(colonMatch[3], 10)
      );
    }
    return Number.parseInt(colonMatch[1], 10) * 60 + Number.parseInt(colonMatch[2], 10);
  }

  const cleaned = rawDuration.replace(/\D/g, '');
  if (!cleaned) return 0;
  const totalTenths = Number.parseInt(cleaned, 10);
  if (Number.isNaN(totalTenths) || totalTenths < 0) return 0;
  const wholeMinutes = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  return wholeMinutes * 60 + tenths * 6;
}

export function isInternalExtension(num: string): boolean {
  return /^\d+$/.test(num) && num.length >= 3 && num.length <= MAX_EXTENSION_LENGTH;
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

  if ((cond === 'E' || cond === 'T') && (!callingExt || !calledExt)) {
    return 'tandem';
  }
  if (!callingExt && !calledExt && hasTrunk) {
    return 'tandem';
  }
  if (cond === '9' || (!callingExt && calledExt)) {
    return 'incoming';
  }
  if (callingExt && !calledExt) {
    return 'outgoing';
  }
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
   * Parses a single raw Avaya CDR line.
   * Supports configured profile first, with intelligent fallback across Avaya CM 8 layouts
   * (time-first 59-char unformatted, LEGACY, CM4PLUS, and space/comma/tab-delimited lines).
   */
  public parseLine(
    rawLine: string,
    overrideProfile?: CdrFormatProfile,
    fallbackDate?: Date | null
  ): ParsedCdrRecord {
    const cleanRaw = rawLine.replace(/[\r\n\0]+/g, '');
    const trimmed = cleanRaw.trim();
    if (!trimmed) {
      throw new Error('Empty CDR line');
    }

    const activeProfile = overrideProfile || this.profile;

    // 1. Space, tab, or comma-delimited customized / UNFORMATTED stream
    if (
      activeProfile === 'UNFORMATTED' ||
      /^\d{4,8}(?:[/-]\d{1,2}[/-]\d{2,4})?[\s,;]+\d{2}:?\d{2}/.test(trimmed)
    ) {
      return this.parseDelimited(trimmed, cleanRaw, activeProfile);
    }

    // 2. Primary configured fixed-width profile
    try {
      return this.parseFixedWidth(cleanRaw, activeProfile);
    } catch (primaryErr) {
      // If an explicit overrideProfile was requested and line is clearly shorter than its minLineLength,
      // preserve descriptive error unless it matches another valid Avaya CM fixed layout of sufficient length.
      const altProfile: CdrFormatProfile = activeProfile === 'CM4PLUS' ? 'LEGACY' : 'CM4PLUS';
      if (cleanRaw.length >= CDR_FORMAT_PROFILES[altProfile].minLineLength) {
        try {
          return this.parseFixedWidth(cleanRaw, altProfile);
        } catch {
          // Continue to time-first unformatted check
        }
      }

      // 3. Avaya CM 8 Standard 59-byte Time-First Unformatted CDR (no date prefix in call line: HHMM + Dur4 + Cond1...)
      if (this.looksLikeTimeFirstUnformatted(cleanRaw)) {
        try {
          return this.parseTimeFirstUnformatted(cleanRaw, fallbackDate);
        } catch {
          // Fall through to throw primary error
        }
      }

      throw primaryErr;
    }
  }

  private looksLikeTimeFirstUnformatted(line: string): boolean {
    if (line.length < 36) return false;
    const hhmm = line.slice(0, 4);
    const dur = line.slice(4, 8);
    const cond = line.slice(8, 9);
    if (!/^\d{4}$/.test(hhmm) || !/^\d{4}$/.test(dur) || !/^[0-9A-Za-z]$/.test(cond)) {
      return false;
    }
    const hh = Number.parseInt(hhmm.slice(0, 2), 10);
    const mm = Number.parseInt(hhmm.slice(2, 4), 10);
    return hh <= 23 && mm <= 59;
  }

  /**
   * Standard Avaya CM Unformatted 59-byte record (without per-line date):
   * 0..3 (4): HHMM
   * 4..7 (4): Duration (tenths of min)
   * 8..8 (1): Condition Code
   * 9..12 (4): Access Code / TAC
   * 13..27 (15): Dialed Number
   * 28..37 (10): Calling Number
   * 38..52 (15): Account Code / Auth Code
   * 53..56 (4): Trunk Group (optional)
   */
  private parseTimeFirstUnformatted(line: string, fallbackDate?: Date | null): ParsedCdrRecord {
    const timeStr = line.slice(0, 4);
    const durStr = line.slice(4, 8);
    const conditionCode = (line.slice(8, 9) || '0').toUpperCase();
    const accessCode = sanitizePrintable(line.slice(9, 13), 16);
    const dialedRaw = sanitizePrintable(line.slice(13, 28), 32);
    const callingNumber = sanitizePrintable(line.slice(28, 38), 32) || 'UNKNOWN';
    const accountCode = sanitizePrintable(line.slice(38, 53), 32) || null;
    const rawTrunk = sanitizePrintable(line.slice(53, 57), 16);

    const baseDate = fallbackDate || new Date();
    const { hour, minute, second } = parseAvayaTimeOnly(timeStr);
    const callStartTime = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      hour,
      minute,
      second,
      0
    );

    const calledNumber =
      dialedRaw.startsWith('9') && dialedRaw.length > 6 ? dialedRaw.slice(1) : dialedRaw || 'UNKNOWN';
    const callDurationSec = parseAvayaDuration(durStr);
    const trunkGroup = deriveTrunkGroup(rawTrunk, accessCode);
    const callType = classifyCallType({
      conditionCode,
      callingNumber,
      calledNumber,
      accessCode,
      trunkGroup,
    });

    const station = isInternalExtension(callingNumber)
      ? callingNumber.slice(0, MAX_EXTENSION_LENGTH)
      : isInternalExtension(calledNumber)
      ? calledNumber.slice(0, MAX_EXTENSION_LENGTH)
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
      ucid: null,
      formatProfile: 'UNFORMATTED',
      rawRecord: line,
    };
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
    const explicitStation = sanitizePrintable(
      sliceField(line, spec.fields.station),
      MAX_EXTENSION_LENGTH
    );
    const ucid = sanitizePrintable(sliceField(line, spec.fields.ucid), 32) || null;

    const calledNumber =
      dialedRaw.startsWith('9') && dialedRaw.length > 6 ? dialedRaw.slice(1) : dialedRaw || 'UNKNOWN';

    const callStartTime = parseAvayaDateTime(dateStr, timeStr);
    const callDurationSec = parseAvayaDuration(durStr);
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

  private parseDelimited(
    trimmed: string,
    rawRecord: string,
    profileName: CdrFormatProfile
  ): ParsedCdrRecord {
    const tokens = trimmed.includes(',')
      ? trimmed.split(/\s*,\s*/).filter(Boolean)
      : trimmed.includes(';')
      ? trimmed.split(/\s*;\s*/).filter(Boolean)
      : trimmed.split(/\s+/);

    if (tokens.length < 6) {
      throw new Error(
        `Invalid space-delimited Avaya CDR line (expected >= 6 tokens, got ${tokens.length})`
      );
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
    const callDurationSec = parseAvayaDuration(durStr);
    const trunkGroup = deriveTrunkGroup(rawTrunk, accessCode);
    const callType = classifyCallType({
      conditionCode,
      callingNumber,
      calledNumber,
      accessCode,
      trunkGroup,
    });

    const station = isInternalExtension(callingNumber)
      ? callingNumber.slice(0, MAX_EXTENSION_LENGTH)
      : isInternalExtension(calledNumber)
      ? calledNumber.slice(0, MAX_EXTENSION_LENGTH)
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

  const dur = String(params.durationTenths).padStart(5, '0').slice(0, 5);
  const cond = (params.conditionCode || '0').slice(0, 1);
  const tac = (params.accessCode || '').padEnd(4, ' ').slice(0, 4);
  const dialed = params.dialedNumber.padEnd(18, ' ').slice(0, 18);
  const calling = params.callingNumber.padEnd(15, ' ').slice(0, 15);
  const acct = (params.accountCode || '').padEnd(8, ' ').slice(0, 8);
  const tg = (params.trunkGroup || '').padEnd(4, ' ').slice(0, 4);
  const stn = (params.station || '')
    .slice(0, MAX_EXTENSION_LENGTH)
    .padEnd(5, ' ')
    .slice(0, 5);
  const ucid = (params.ucid || '00001000011731458290').padEnd(20, '0').slice(0, 20);
  return `${mm}${dd}${yy}${hh}${min}${dur}${cond}${tac}${dialed}${calling}${acct}${tg}${stn}${ucid}`;
}
