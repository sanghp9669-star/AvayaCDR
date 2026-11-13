import { integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// Users table linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Avaya Aura Communication Manager CDR records table
export const cdrRecords = pgTable('cdr_records', {
  id: serial('id').primaryKey(),
  callStartTime: timestamp('call_start_time').notNull(),
  callDurationSec: integer('call_duration_sec').notNull().default(0),
  callingNumber: varchar('calling_number', { length: 32 }).notNull(),
  calledNumber: varchar('called_number', { length: 32 }).notNull(),
  trunkGroup: varchar('trunk_group', { length: 32 }).notNull().default('-'),
  station: varchar('station', { length: 32 }),
  callType: varchar('call_type', { length: 32 }).notNull(), // incoming | outgoing | tandem | internal | ineffective
  conditionCode: varchar('condition_code', { length: 8 }).notNull().default('0'),
  accessCode: varchar('access_code', { length: 16 }),
  accountCode: varchar('account_code', { length: 32 }),
  ucid: varchar('ucid', { length: 32 }),
  formatProfile: varchar('format_profile', { length: 24 }).notNull().default('CM4PLUS'),
  rawRecord: text('raw_record').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Persisted Avaya CM CDR Listener connection parameters configurable via Web UI
export const cdrSettings = pgTable('cdr_settings', {
  id: serial('id').primaryKey(),
  listenHost: varchar('listen_host', { length: 64 }).notNull().default('0.0.0.0'),
  listenPort: integer('listen_port').notNull().default(5000),
  protocol: varchar('protocol', { length: 16 }).notNull().default('TCP'),
  formatProfile: varchar('format_profile', { length: 24 }).notNull().default('CM4PLUS'),
  cmSourceIp: varchar('cm_source_ip', { length: 64 }).notNull().default(''),
  cmNodeName: varchar('cm_node_name', { length: 64 }).notNull().default('procr'),
  enabled: integer('enabled').notNull().default(1), // 1 = enabled, 0 = disabled
  githubRepo: varchar('github_repo', { length: 128 }).notNull().default(''),
  githubBranch: varchar('github_branch', { length: 64 }).notNull().default('main'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type CdrRecordRow = typeof cdrRecords.$inferSelect;
export type NewCdrRecordRow = typeof cdrRecords.$inferInsert;
export type CdrSettingsRow = typeof cdrSettings.$inferSelect;
