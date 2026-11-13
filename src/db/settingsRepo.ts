import { eq } from 'drizzle-orm';
import type { CdrFormatProfile, CdrProtocol } from '../../shared/cdrTypes.ts';
import { logError } from '../../server/logger.ts';
import { db } from './index.ts';
import { cdrSettings } from './schema.ts';

export interface StoredConnectionSettings {
  listenHost: string;
  listenPort: number;
  protocol: CdrProtocol;
  formatProfile: CdrFormatProfile;
  cmSourceIp: string;
  cmNodeName: string;
  enabled: boolean;
  updatedAt: string;
}

export async function getStoredConnectionSettings(): Promise<StoredConnectionSettings | null> {
  try {
    const rows = await db.select().from(cdrSettings).where(eq(cdrSettings.id, 1)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      listenHost: row.listenHost,
      listenPort: row.listenPort,
      protocol: (row.protocol as CdrProtocol) || 'TCP',
      formatProfile: (row.formatProfile as CdrFormatProfile) || 'CM4PLUS',
      cmSourceIp: row.cmSourceIp,
      cmNodeName: row.cmNodeName,
      enabled: row.enabled === 1,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    logError('Failed to load cdr_settings from PostgreSQL', error);
    throw new Error('Failed to load connection settings.', { cause: error });
  }
}

export async function saveConnectionSettings(input: {
  listenHost: string;
  listenPort: number;
  protocol: CdrProtocol;
  formatProfile: CdrFormatProfile;
  cmSourceIp: string;
  cmNodeName: string;
  enabled: boolean;
  updatedBy: string;
}): Promise<StoredConnectionSettings> {
  try {
    const now = new Date();
    const result = await db
      .insert(cdrSettings)
      .values({
        id: 1,
        listenHost: input.listenHost,
        listenPort: input.listenPort,
        protocol: input.protocol,
        formatProfile: input.formatProfile,
        cmSourceIp: input.cmSourceIp,
        cmNodeName: input.cmNodeName,
        enabled: input.enabled ? 1 : 0,
        updatedBy: input.updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: cdrSettings.id,
        set: {
          listenHost: input.listenHost,
          listenPort: input.listenPort,
          protocol: input.protocol,
          formatProfile: input.formatProfile,
          cmSourceIp: input.cmSourceIp,
          cmNodeName: input.cmNodeName,
          enabled: input.enabled ? 1 : 0,
          updatedBy: input.updatedBy,
          updatedAt: now,
        },
      })
      .returning();

    const row = result[0];
    return {
      listenHost: row.listenHost,
      listenPort: row.listenPort,
      protocol: row.protocol as CdrProtocol,
      formatProfile: row.formatProfile as CdrFormatProfile,
      cmSourceIp: row.cmSourceIp,
      cmNodeName: row.cmNodeName,
      enabled: row.enabled === 1,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    logError('Failed to save cdr_settings to PostgreSQL', error);
    throw new Error('Failed to save connection settings.', { cause: error });
  }
}
