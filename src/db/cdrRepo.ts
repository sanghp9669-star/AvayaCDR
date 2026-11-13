import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import type {
  CdrCallType,
  CdrFormatProfile,
  CdrListResponse,
  CdrQueryFilter,
  CdrRecordDto,
  CdrSummaryStats,
} from '../../shared/cdrTypes.ts';
import { buildFixedWidthCdrLine, CdrParser, type ParsedCdrRecord } from '../../server/cdrParser.ts';
import { logError } from '../../server/logger.ts';
import { db } from './index.ts';
import { cdrRecords, type CdrRecordRow } from './schema.ts';

function toDto(row: CdrRecordRow): CdrRecordDto {
  return {
    id: row.id,
    callStartTime: row.callStartTime.toISOString(),
    callDurationSec: row.callDurationSec,
    callingNumber: row.callingNumber,
    calledNumber: row.calledNumber,
    trunkGroup: row.trunkGroup,
    station: row.station ?? null,
    callType: (row.callType as CdrCallType) || 'outgoing',
    conditionCode: row.conditionCode,
    accessCode: row.accessCode ?? null,
    accountCode: row.accountCode ?? null,
    ucid: row.ucid ?? null,
    formatProfile: (row.formatProfile as CdrFormatProfile) || 'CM4PLUS',
    rawRecord: row.rawRecord,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhereConditions(filter: CdrQueryFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (filter.from) {
    const fromDate = new Date(filter.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push(gte(cdrRecords.callStartTime, fromDate));
    }
  }

  if (filter.to) {
    const toDate = new Date(filter.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push(lte(cdrRecords.callStartTime, toDate));
    }
  }

  if (filter.calling_number?.trim()) {
    conditions.push(ilike(cdrRecords.callingNumber, `%${filter.calling_number.trim()}%`));
  }

  if (filter.called_number?.trim()) {
    conditions.push(ilike(cdrRecords.calledNumber, `%${filter.called_number.trim()}%`));
  }

  if (filter.trunk_group?.trim() && filter.trunk_group !== 'all') {
    conditions.push(ilike(cdrRecords.trunkGroup, `%${filter.trunk_group.trim()}%`));
  }

  if (filter.call_type && filter.call_type !== 'all') {
    conditions.push(eq(cdrRecords.callType, filter.call_type));
  }

  if (filter.station?.trim()) {
    const stn = `%${filter.station.trim()}%`;
    const stationOr = or(
      ilike(cdrRecords.station, stn),
      ilike(cdrRecords.callingNumber, stn),
      ilike(cdrRecords.calledNumber, stn)
    );
    if (stationOr) conditions.push(stationOr);
  }

  if (filter.search?.trim()) {
    const q = `%${filter.search.trim()}%`;
    const searchOr = or(
      ilike(cdrRecords.callingNumber, q),
      ilike(cdrRecords.calledNumber, q),
      ilike(cdrRecords.station, q),
      ilike(cdrRecords.trunkGroup, q),
      ilike(cdrRecords.accountCode, q),
      ilike(cdrRecords.ucid, q)
    );
    if (searchOr) conditions.push(searchOr);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function insertCdrRecord(parsed: ParsedCdrRecord): Promise<CdrRecordDto> {
  try {
    const inserted = await db
      .insert(cdrRecords)
      .values({
        callStartTime: parsed.callStartTime,
        callDurationSec: parsed.callDurationSec,
        callingNumber: parsed.callingNumber,
        calledNumber: parsed.calledNumber,
        trunkGroup: parsed.trunkGroup,
        station: parsed.station,
        callType: parsed.callType,
        conditionCode: parsed.conditionCode,
        accessCode: parsed.accessCode,
        accountCode: parsed.accountCode,
        ucid: parsed.ucid,
        formatProfile: parsed.formatProfile,
        rawRecord: parsed.rawRecord,
      })
      .returning();

    return toDto(inserted[0]);
  } catch (error) {
    logError('Failed to insert CDR record into PostgreSQL', error);
    throw new Error('Failed to store CDR record.', { cause: error });
  }
}

export async function listCdrRecords(filter: CdrQueryFilter): Promise<CdrListResponse> {
  try {
    const whereClause = buildWhereConditions(filter);
    const pageSize = Math.min(Math.max(Number(filter.page_size) || 25, 1), 200);
    const requestedPage = Math.max(Number(filter.page) || 1, 1);

    const summaryRows = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalDurationSec: sql<number>`coalesce(sum(${cdrRecords.callDurationSec}), 0)::int`,
        incomingCount: sql<number>`count(*) filter (where ${cdrRecords.callType} = 'incoming')::int`,
        outgoingCount: sql<number>`count(*) filter (where ${cdrRecords.callType} = 'outgoing')::int`,
        tandemCount: sql<number>`count(*) filter (where ${cdrRecords.callType} = 'tandem')::int`,
        internalCount: sql<number>`count(*) filter (where ${cdrRecords.callType} = 'internal')::int`,
        ineffectiveCount: sql<number>`count(*) filter (where ${cdrRecords.callType} = 'ineffective')::int`,
      })
      .from(cdrRecords)
      .where(whereClause);

    const agg = summaryRows[0];
    const total = agg?.totalCalls ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const sortDirFn = filter.sortDir === 'asc' ? asc : desc;
    const sortCol =
      filter.sortBy === 'call_duration_sec'
        ? cdrRecords.callDurationSec
        : filter.sortBy === 'calling_number'
        ? cdrRecords.callingNumber
        : filter.sortBy === 'called_number'
        ? cdrRecords.calledNumber
        : filter.sortBy === 'call_type'
        ? cdrRecords.callType
        : cdrRecords.callStartTime;

    const rows = await db
      .select()
      .from(cdrRecords)
      .where(whereClause)
      .orderBy(sortDirFn(sortCol), desc(cdrRecords.id))
      .limit(pageSize)
      .offset(offset);

    const connectedCount = Math.max(0, total - (agg?.ineffectiveCount ?? 0));
    const summary: CdrSummaryStats = {
      totalCalls: total,
      totalDurationSec: agg?.totalDurationSec ?? 0,
      avgDurationSec: connectedCount > 0 ? Math.round((agg?.totalDurationSec ?? 0) / connectedCount) : 0,
      incomingCount: agg?.incomingCount ?? 0,
      outgoingCount: agg?.outgoingCount ?? 0,
      tandemCount: agg?.tandemCount ?? 0,
      internalCount: agg?.internalCount ?? 0,
      ineffectiveCount: agg?.ineffectiveCount ?? 0,
    };

    return {
      records: rows.map(toDto),
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      summary,
    };
  } catch (error) {
    logError('Failed to list CDR records from PostgreSQL', error);
    throw new Error('Database query failed while loading CDR records.', { cause: error });
  }
}

export async function getCdrRecordById(id: number): Promise<CdrRecordDto | null> {
  try {
    const rows = await db.select().from(cdrRecords).where(eq(cdrRecords.id, id)).limit(1);
    return rows[0] ? toDto(rows[0]) : null;
  } catch (error) {
    logError(`Failed to fetch CDR record id=${id}`, error);
    throw new Error('Database query failed while fetching CDR detail.', { cause: error });
  }
}

export async function exportCdrRecords(filter: CdrQueryFilter): Promise<CdrRecordDto[]> {
  try {
    const whereClause = buildWhereConditions(filter);
    const rows = await db
      .select()
      .from(cdrRecords)
      .where(whereClause)
      .orderBy(desc(cdrRecords.callStartTime), desc(cdrRecords.id))
      .limit(5000);
    return rows.map(toDto);
  } catch (error) {
    logError('Failed to export CDR records', error);
    throw new Error('Database query failed while exporting CDR records.', { cause: error });
  }
}

export async function seedSampleAvayaRecords(profile: CdrFormatProfile = 'CM4PLUS'): Promise<number> {
  try {
    const parser = new CdrParser(profile);
    const now = new Date();
    const samples: Array<{
      minsAgo: number;
      durTenths: number;
      cond: string;
      tac: string;
      dialed: string;
      calling: string;
      acct: string;
      tg: string;
      stn: string;
    }> = [
      { minsAgo: 12, durTenths: 35, cond: '9', tac: '801', dialed: '3001', calling: '0903451289', acct: 'AC1001', tg: '0001', stn: '3001' },
      { minsAgo: 28, durTenths: 22, cond: '0', tac: '801', dialed: '90912883401', calling: '2101', acct: 'AC2101', tg: '0001', stn: '2101' },
      { minsAgo: 45, durTenths: 0, cond: '4', tac: '802', dialed: '90987654321', calling: '2102', acct: 'AC2102', tg: '0002', stn: '2102' },
      { minsAgo: 70, durTenths: 18, cond: 'E', tac: '803', dialed: '902838221045', calling: '0938112299', acct: 'TD9001', tg: '0003', stn: '' },
      { minsAgo: 95, durTenths: 14, cond: 'A', tac: '', dialed: '2001', calling: '4001', acct: '', tg: '0010', stn: '4001' },
      { minsAgo: 140, durTenths: 0, cond: '7', tac: '801', dialed: '90974556120', calling: '3002', acct: '', tg: '0001', stn: '3002' },
      { minsAgo: 190, durTenths: 48, cond: '9', tac: '802', dialed: '3003', calling: '02439741122', acct: 'VIP88', tg: '0002', stn: '3003' },
      { minsAgo: 260, durTenths: 0, cond: 'B', tac: '801', dialed: '90014085550199', calling: '5001', acct: 'FRL4', tg: '0001', stn: '5001' },
      { minsAgo: 340, durTenths: 64, cond: '0', tac: '803', dialed: '902873008899', calling: '2001', acct: 'EXEC01', tg: '0003', stn: '2001' },
      { minsAgo: 420, durTenths: 0, cond: '8', tac: '801', dialed: '3001', calling: '0868123990', acct: '', tg: '0001', stn: '3001' },
    ];

    const valuesToInsert = samples.map((s, idx) => {
      const dt = new Date(now.getTime() - s.minsAgo * 60 * 1000);
      const ucid = `00001${(Date.now() + idx).toString(16).padStart(15, '0')}`.slice(0, 20);
      const rawLine = buildFixedWidthCdrLine({
        profile,
        date: dt,
        durationTenths: s.durTenths,
        conditionCode: s.cond,
        accessCode: s.tac,
        dialedNumber: s.dialed,
        callingNumber: s.calling,
        accountCode: s.acct,
        trunkGroup: s.tg,
        station: s.stn,
        ucid,
      });
      const parsed = parser.parseLine(rawLine, profile);
      return {
        callStartTime: parsed.callStartTime,
        callDurationSec: parsed.callDurationSec,
        callingNumber: parsed.callingNumber,
        calledNumber: parsed.calledNumber,
        trunkGroup: parsed.trunkGroup,
        station: parsed.station,
        callType: parsed.callType,
        conditionCode: parsed.conditionCode,
        accessCode: parsed.accessCode,
        accountCode: parsed.accountCode,
        ucid: parsed.ucid,
        formatProfile: parsed.formatProfile,
        rawRecord: parsed.rawRecord,
      };
    });

    await db.insert(cdrRecords).values(valuesToInsert);
    return valuesToInsert.length;
  } catch (error) {
    logError('Failed to seed sample Avaya CDR records', error);
    throw new Error('Failed to seed sample CDR records.', { cause: error });
  }
}
