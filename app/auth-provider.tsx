"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { firebaseAuth } from "./lib/firebase-client";
import type { SessionUser } from "./lib/shared/user";

type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isFirebaseNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "auth/network-request-failed";
}

export function AuthProvider({
  children,
  initialUser = null
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser);

  async function refreshSession() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store"
      });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as { user: SessionUser | null };
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function signOutUser() {
    setIsLoading(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      await signOut(firebaseAuth);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!initialUser) {
      refreshSession();
      return;
    }

    setIsLoading(false);
  }, [initialUser]);

  useEffect(() => {
    return onIdTokenChanged(firebaseAuth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const idToken = await nextUser.getIdToken();
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ idToken })
        });

        if (response.ok) {
          const data = (await response.json()) as { user: SessionUser | null };
          setUser(data.user);
        }
      } catch (error) {
        if (!isFirebaseNetworkError(error)) {
          console.error("Unable to refresh Firebase session token.", error);
        }
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, refreshSession, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
