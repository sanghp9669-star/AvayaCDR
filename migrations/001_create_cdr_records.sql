-- Migration: 001_create_cdr_records.sql
-- PostgreSQL schema for Avaya Aura Communication Manager CDR Receiver & Web Dashboard

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cdr_records (
  id SERIAL PRIMARY KEY,
  call_start_time TIMESTAMP NOT NULL,
  call_duration_sec INTEGER NOT NULL DEFAULT 0,
  calling_number VARCHAR(32) NOT NULL,
  called_number VARCHAR(32) NOT NULL,
  trunk_group VARCHAR(32) NOT NULL DEFAULT '-',
  station VARCHAR(32),
  call_type VARCHAR(32) NOT NULL,
  condition_code VARCHAR(8) NOT NULL DEFAULT '0',
  access_code VARCHAR(16),
  account_code VARCHAR(32),
  ucid VARCHAR(32),
  format_profile VARCHAR(24) NOT NULL DEFAULT 'CM4PLUS',
  raw_record TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_call_start_time ON cdr_records (call_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_cdr_calling_number ON cdr_records (calling_number);
CREATE INDEX IF NOT EXISTS idx_cdr_called_number ON cdr_records (called_number);
CREATE INDEX IF NOT EXISTS idx_cdr_trunk_group ON cdr_records (trunk_group);
CREATE INDEX IF NOT EXISTS idx_cdr_call_type ON cdr_records (call_type);
