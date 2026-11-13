import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const resolvedProjectId =
  (process.env.FIREBASE_PROJECT_ID || '').trim() || firebaseConfig.projectId;

if (!getApps().length) {
  initializeApp({
    projectId: resolvedProjectId,
  });
}

export const adminAuth = getAuth();
