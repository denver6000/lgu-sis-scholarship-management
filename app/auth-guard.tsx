"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <main className="auth-state-screen">
        <div className="auth-state-panel">Checking your session...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-state-screen">
        <section className="auth-state-panel">
          <p className="eyebrow">Authentication Required</p>
          <h1>Sign in to continue</h1>
          <p>Your session is not active. Use the button below when you are ready to open the login page.</p>
          <Link className="primary auth-link-button" href="/login">
            Go to Login
          </Link>
        </section>
      </main>
    );
  }

  return children;
}
