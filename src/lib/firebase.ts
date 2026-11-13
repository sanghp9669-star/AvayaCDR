import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const resolvedConfig = {
  ...firebaseConfig,
  ...(import.meta.env.VITE_FIREBASE_API_KEY
    ? { apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY) }
    : {}),
  ...(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
    ? { authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) }
    : {}),
  ...(import.meta.env.VITE_FIREBASE_PROJECT_ID
    ? { projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID) }
    : {}),
  ...(import.meta.env.VITE_FIREBASE_APP_ID
    ? { appId: String(import.meta.env.VITE_FIREBASE_APP_ID) }
    : {}),
};

const app = initializeApp(resolvedConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
