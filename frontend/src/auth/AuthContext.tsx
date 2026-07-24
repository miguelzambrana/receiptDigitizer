import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getToken,
  login as apiLogin,
  onTokenChange,
  register as apiRegister,
  setToken as apiSetToken,
} from "../api/client";

interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  useEffect(() => {
    const unsubscribe = onTokenChange(() => {
      setTokenState(getToken());
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setTokenState(res.access_token);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRegister(email, password);
    setTokenState(res.access_token);
  }, []);

  const logout = useCallback(() => {
    apiSetToken(null);
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ token, login, register, logout }),
    [token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
