import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  username?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (userObj: User, jwtToken: string, remember?: boolean) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Load stored token/user: prefer localStorage (remember me), then sessionStorage
  useEffect(() => {
    const localToken = localStorage.getItem("token");
    const sessionToken = sessionStorage.getItem("token");
    const storedToken = localToken || sessionToken;

    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");

    if (storedToken) {
      setToken(storedToken);
      try {
        setUser(storedUser ? JSON.parse(storedUser) : null);
      } catch {
        setUser(null);
      }
    }
  }, []);

  function login(userObj: User, jwtToken: string, remember: boolean = false) {
    setUser(userObj);
    setToken(jwtToken);

    if (remember) {
      localStorage.setItem("token", jwtToken);
      localStorage.setItem("user", JSON.stringify(userObj));
    } else {
      sessionStorage.setItem("token", jwtToken);
      sessionStorage.setItem("user", JSON.stringify(userObj));
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
