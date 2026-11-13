import type { NextFunction, Request, Response } from 'express';
import { logError } from '../../server/logger.ts';
import { verifyLocalAuthToken } from '../../server/localAuth.ts';
import { getOrCreateUser } from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  username?: string;
  role?: string;
  provider?: 'local' | 'google';
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty token' });
    return;
  }

  // 1. Verify local admin JWT first (works offline/LAN/self-hosted without Google/Firebase domain dependency)
  const localClaims = verifyLocalAuthToken(token);
  if (localClaims) {
    req.user = {
      uid: localClaims.uid,
      email: localClaims.email,
      username: localClaims.username,
      role: localClaims.role,
      provider: 'local',
    };
    next();
    return;
  }

  // 2. Fall back to Firebase ID Token verification (Google Sign-In)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: 'admin',
      provider: 'google',
    };

    if (decodedToken.uid) {
      await getOrCreateUser(decodedToken.uid, decodedToken.email || 'unknown@avaya-cdr.local');
    }

    next();
  } catch (error) {
    logError('Authentication verification failed', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
