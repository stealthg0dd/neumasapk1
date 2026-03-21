import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { LoginResponse } from "../types";

interface AuthState {
  token: string | null;
  orgId: string | null;
  propertyId: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  saveAuth: (res: LoginResponse) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): AuthState {
  return {
    token: localStorage.getItem("access_token"),
    orgId: localStorage.getItem("org_id"),
    propertyId: localStorage.getItem("property_id"),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(readStorage);

  const saveAuth = useCallback((res: LoginResponse) => {
    const { access_token, profile } = res;
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("org_id", profile.org_id);
    localStorage.setItem("property_id", profile.property_id);
    setAuth({
      token: access_token,
      orgId: profile.org_id,
      propertyId: profile.property_id,
    });
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("org_id");
    localStorage.removeItem("property_id");
    setAuth({ token: null, orgId: null, propertyId: null });
  }, []);

  const value = useMemo(
    () => ({ ...auth, isAuthenticated: !!auth.token, saveAuth, clearAuth }),
    [auth, saveAuth, clearAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
