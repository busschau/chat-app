import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import apiClient from "../lib/apiClient";

type User = {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  image?: string;
  profileSetup?: boolean;
  color?: string;
};

type AuthContextType = {
  user: User | null;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      const response = await apiClient.get("/api/auth/userinfo");
      const nextUser = (response.data?.user ?? response.data) as User;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const login = useCallback(
    async (identifier: string, password: string): Promise<User> => {
      const response = await apiClient.post("/api/auth/login", {
        // Send both for backward compatibility so the backend
        // can treat this as either a username or an email.
        username: identifier,
        email: identifier,
        password,
      });
      const nextUser = response.data?.user as User;
      setUser(nextUser);
      return nextUser;
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    await apiClient.post("/api/auth/logout");
    setUser(null);
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      checkAuth,
    }),
    [user, login, logout, checkAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
