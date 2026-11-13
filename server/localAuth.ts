import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface LocalAuthClaims {
  uid: string;
  email: string;
  username: string;
  role: string;
  iss: string;
  iat: number;
  exp: number;
}

const TOKEN_ISSUER = 'avaya-cdr-local';
const TOKEN_TTL_SEC = 24 * 60 * 60; // 24 hours
const SCRYPT_KEYLEN = 64;

let cachedSecret: string | null = null;

function getAuthSecret(): string {
  const envSecret = (process.env.AUTH_SECRET || process.env.JWT_SECRET || '').trim();
  if (envSecret.length >= 16) {
    return envSecret;
  }

  if (cachedSecret) {
    return cachedSecret;
  }

  const logDir = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');
  const secretFile = path.join(logDir, '.auth-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    fs.mkdirSync(logDir, { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    cachedSecret = generated;
    return cachedSecret;
  } catch {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    return cachedSecret;
  }
}

export function hashPassword(password: string): string {
  if (password.length < 8) {
    throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  try {
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signLocalAuthToken(user: {
  uid: string;
  email: string;
  username: string;
  role?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadObj: LocalAuthClaims = {
    uid: user.uid,
    email: user.email,
    username: user.username,
    role: user.role || 'admin',
    iss: TOKEN_ISSUER,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createHmac('sha256', getAuthSecret())
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyLocalAuthToken(token: string): LocalAuthClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getAuthSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const providedSig = Buffer.from(sigB64, 'base64url');
    if (expectedSig.length !== providedSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as Partial<LocalAuthClaims>;
    if (payload.iss !== TOKEN_ISSUER) return null;
    if (!payload.uid || !payload.email || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return {
      uid: payload.uid,
      email: payload.email,
      username: payload.username || payload.email,
      role: payload.role || 'admin',
      iss: payload.iss,
      iat: payload.iat || now,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function validateUsername(username: string): string {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(clean)) {
    throw new Error('Tên đăng nhập phải từ 3–32 ký tự (chữ thường, số, ., _, -).');
  }
  return clean;
}

export function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
