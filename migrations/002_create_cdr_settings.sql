-- Migration: 002_create_cdr_settings.sql
-- Stores Avaya CM CDR Adjunct connection settings configurable via Web UI

CREATE TABLE IF NOT EXISTS cdr_settings (
  id SERIAL PRIMARY KEY,
  listen_host VARCHAR(64) NOT NULL DEFAULT '0.0.0.0',
  listen_port INTEGER NOT NULL DEFAULT 5000,
  protocol VARCHAR(16) NOT NULL DEFAULT 'TCP',
  format_profile VARCHAR(24) NOT NULL DEFAULT 'CM4PLUS',
  cm_source_ip VARCHAR(64) NOT NULL DEFAULT '',
  cm_node_name VARCHAR(64) NOT NULL DEFAULT 'procr',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
