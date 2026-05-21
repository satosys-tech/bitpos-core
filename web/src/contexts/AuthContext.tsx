import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setToken } from "@/lib/api";

export interface EntityInfo {
  id: string;
  handle: string;
}

export interface AccountInfo {
  id: string;
  balanceSats: number;
  businessName?: string | null;
}

interface AuthState {
  token: string | null;
  entity: EntityInfo | null;
  account: AccountInfo | null;
  loading: boolean;
  setupRequired: boolean;
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string, entity: EntityInfo, account: AccountInfo) => void;
  updateAccount: (account: AccountInfo) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    entity: null,
    account: null,
    loading: true,
    setupRequired: false,
  });

  useEffect(() => {
    const init = async () => {
      // Try to restore session via refresh cookie
      try {
        const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setToken(data.token);
          setState({ token: data.token, entity: data.entity, account: data.account, loading: false, setupRequired: false });
          return;
        }
      } catch { /* ignore */ }

      // Not logged in — check if setup is needed
      try {
        const s = await fetch("/api/setup-status");
        if (s.ok) {
          const { configured } = await s.json();
          setState({ token: null, entity: null, account: null, loading: false, setupRequired: !configured });
          return;
        }
      } catch { /* ignore */ }

      setState({ token: null, entity: null, account: null, loading: false, setupRequired: false });
    };

    init();
  }, []);

  const setAuth = useCallback((token: string, entity: EntityInfo, account: AccountInfo) => {
    setToken(token);
    setState({ token, entity, account, loading: false, setupRequired: false });
  }, []);

  const updateAccount = useCallback((account: AccountInfo) => {
    setState((s) => ({ ...s, account }));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setState({ token: null, entity: null, account: null, loading: false, setupRequired: false });
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setAuth, updateAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
