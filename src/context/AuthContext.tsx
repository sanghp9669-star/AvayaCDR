import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthError,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface AppAuthUser {
  uid: string;
  email: string | null;
  username?: string;
  provider: 'google' | 'local';
}

interface AuthContextValue {
  user: AppAuthUser | null;
  loading: boolean;
  authError: string | null;
  localSetupRequired: boolean;
  googleSigningIn: boolean;
  localSubmitting: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithLocal: (identifier: string, password: string) => Promise<void>;
  setupLocalAdmin: (username: string, email: string, password: string) => Promise<void>;
  clearAuthError: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
}

const LOCAL_TOKEN_KEY = 'avaya_cdr_session_token';
const AuthContext = createContext<AuthContextValue | null>(null);

function formatGoogleAuthError(err: unknown): string {
  const code = (err as Partial<AuthError>)?.code || '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'server';

  switch (code) {
    case 'auth/unauthorized-domain':
      return `Tên miền hoặc IP hiện tại (${hostname}) chưa được cấp quyền trong Firebase Authentication (auth/unauthorized-domain). Khi deploy lên server riêng, hãy đăng nhập bằng tài khoản Quản trị nội bộ ở trên, hoặc thêm "${hostname}" vào Authorized Domains trên Firebase Console dự án của bạn.`;
    case 'auth/popup-closed-by-user':
      return 'Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất.';
    case 'auth/cancelled-popup-request':
      return 'Yêu cầu đăng nhập Google đã bị hủy do mở nhiều cửa sổ cùng lúc.';
    case 'auth/network-request-failed':
      return 'Không thể kết nối tới máy chủ xác thực Google (kiểm tra kết nối Internet hoặc tường lửa). Bạn vẫn có thể đăng nhập bằng tài khoản Quản trị nội bộ.';
    case 'auth/operation-not-allowed':
      return 'Phương thức đăng nhập Google chưa được bật trên Firebase project đang cấu hình.';
    default:
      return err instanceof Error ? err.message : 'Đăng nhập Google không thành công.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppAuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [localSetupRequired, setLocalSetupRequired] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const localTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function initAuth() {
      // 1. Check whether initial local admin setup is needed
      try {
        const modeRes = await fetch('/api/auth/mode');
        if (modeRes.ok && active) {
          const modeData = (await modeRes.json()) as { localSetupRequired?: boolean };
          setLocalSetupRequired(Boolean(modeData.localSetupRequired));
        }
      } catch {
        // Non-fatal
      }

      // 2. Restore local session token from sessionStorage if valid
      const savedToken =
        typeof window !== 'undefined' ? window.sessionStorage.getItem(LOCAL_TOKEN_KEY) : null;
      if (savedToken) {
        try {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (meRes.ok) {
            const meData = (await meRes.json()) as {
              user?: { uid: string; email?: string; username?: string };
            };
            if (meData.user && active) {
              localTokenRef.current = savedToken;
              setUser({
                uid: meData.user.uid,
                email: meData.user.email || null,
                username: meData.user.username,
                provider: 'local',
              });
              setLoading(false);
              return;
            }
          }
        } catch {
          // Ignore and clear stale token
        }
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(LOCAL_TOKEN_KEY);
        }
      }

      // 3. Handle redirect result if returning from Google OAuth redirect
      try {
        await getRedirectResult(auth);
      } catch (err) {
        if (active) {
          setAuthError(formatGoogleAuthError(err));
        }
      }
    }

    void initAuth();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!active) return;
      if (localTokenRef.current) {
        setLoading(false);
        return;
      }
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          provider: 'google',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setGoogleSigningIn(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code = (err as Partial<AuthError>)?.code || '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, googleAuthProvider);
          return;
        } catch (redirectErr) {
          setAuthError(formatGoogleAuthError(redirectErr));
          return;
        }
      }
      setAuthError(formatGoogleAuthError(err));
    } finally {
      setGoogleSigningIn(false);
    }
  }, []);

  const signInWithLocal = useCallback(async (identifier: string, password: string) => {
    setAuthError(null);
    setLocalSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: { uid: string; email?: string; username?: string };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }

      localTokenRef.current = data.token;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(LOCAL_TOKEN_KEY, data.token);
      }
      setLocalSetupRequired(false);
      setUser({
        uid: data.user.uid,
        email: data.user.email || null,
        username: data.user.username,
        provider: 'local',
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
      throw err;
    } finally {
      setLocalSubmitting(false);
    }
  }, []);

  const setupLocalAdmin = useCallback(
    async (username: string, email: string, password: string) => {
      setAuthError(null);
      setLocalSubmitting(true);
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: { uid: string; email?: string; username?: string };
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          throw new Error(data.error || 'Không thể khởi tạo tài khoản quản trị.');
        }

        localTokenRef.current = data.token;
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(LOCAL_TOKEN_KEY, data.token);
        }
        setLocalSetupRequired(false);
        setUser({
          uid: data.user.uid,
          email: data.user.email || null,
          username: data.user.username,
          provider: 'local',
        });
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Không thể thiết lập tài khoản.');
        throw err;
      } finally {
        setLocalSubmitting(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    localTokenRef.current = null;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LOCAL_TOKEN_KEY);
    }
    setUser(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
  }, []);

  const getToken = useCallback(async () => {
    if (localTokenRef.current) {
      return localTokenRef.current;
    }
    if (!auth.currentUser) {
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    return auth.currentUser.getIdToken();
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        localSetupRequired,
        googleSigningIn,
        localSubmitting,
        signInWithGoogle,
        signInWithLocal,
        setupLocalAdmin,
        clearAuthError,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
