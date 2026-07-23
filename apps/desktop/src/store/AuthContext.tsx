import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, setAuthToken } from '../lib/api-client';

const STORAGE_KEY = 'navoasis.auth';

export interface AuthUser {
  sub: string;
  companyId: string;
  email: string;
  roles: string[];
}

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login(companyId: string, email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Decodes a JWT's payload without verifying the signature — verification already happened server-side. */
function decodeJwtPayload(token: string): AuthUser | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = JSON.parse(json) as Partial<AuthUser>;
    if (!decoded.sub || !decoded.companyId || !decoded.email) return null;
    return {
      sub: decoded.sub,
      companyId: decoded.companyId,
      email: decoded.email,
      roles: decoded.roles ?? [],
    };
  } catch {
    return null;
  }
}

function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored) {
      const decoded = decodeJwtPayload(stored.accessToken);
      if (decoded) {
        setAuthToken(stored.accessToken);
        setUser(decoded);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setInitialized(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      async login(companyId: string, email: string, password: string) {
        const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
          '/auth/login',
          {
            method: 'POST',
            body: { companyId, email, password },
          },
        );
        const decoded = decodeJwtPayload(tokens.accessToken);
        if (!decoded) throw new Error('Received an unreadable access token.');
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
        );
        setAuthToken(tokens.accessToken);
        setUser(decoded);
      },
      logout() {
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken(null);
        setUser(null);
      },
    }),
    [user],
  );

  // Avoid flashing the login page before we've had a chance to read localStorage.
  if (!initialized) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}
