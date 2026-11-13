-- Migration 004: Support local administrator authentication alongside Google Sign-In
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'admin';
