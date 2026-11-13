import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve(process.cwd(), process.env.LOG_DIR || 'logs');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function appendLog(filename: string, line: string): void {
  try {
    ensureLogDir();
    const filePath = path.join(LOG_DIR, filename);
    fs.appendFile(filePath, `${line}\n`, 'utf8', (err) => {
      if (err) {
        console.error(`Failed to write log ${filename}:`, err.message);
      }
    });
  } catch (err) {
    console.error(`Logger error (${filename}):`, err);
  }
}

export function logAccess(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const ip = req.ip || req.socket.remoteAddress || '-';
    const line = `[${new Date().toISOString()}] ${ip} "${req.method} ${req.originalUrl}" ${res.statusCode} ${durationMs}ms`;
    appendLog('access.log', line);
  });
  next();
}

export function logError(message: string, err?: unknown): void {
  const detail =
    err instanceof Error ? `${err.message} | ${err.stack || ''}` : err ? String(err) : '';
  const line = `[${new Date().toISOString()}] ERROR: ${message}${detail ? ` — ${detail}` : ''}`;
  appendLog('error.log', line);
  console.error(line);
}

export function logListener(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  appendLog('cdr-listener.log', line);
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logRawCdr(rawLine: string, sourceIp = 'unknown'): void {
  const line = `[${new Date().toISOString()}] [${sourceIp}] ${rawLine}`;
  appendLog('cdr-raw.log', line);
}
