-- Migration: 003_add_github_update_settings.sql
-- Adds GitHub repository & branch configuration for checking/applying updates via Web UI

ALTER TABLE cdr_settings
  ADD COLUMN IF NOT EXISTS github_repo VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS github_branch VARCHAR(64) NOT NULL DEFAULT 'main';
