"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface Props {
  initialUser?: { email: string } | null;
}

export function Nav({ initialUser }: Props) {
  const [user, setUser] = useState<{ email: string } | null>(initialUser || null);

  useEffect(() => {
    // If server already detected user, no need to re-fetch
    if (initialUser) return;

    async function check() {
      const res = await fetch("/api/v1/auth/me");
      if (res.ok) {
        const d = await res.json();
        if (d.email) { setUser(d); return; }
      }
      // Fallback: API key from localStorage
      const storedKey = localStorage.getItem("apiKey");
      if (storedKey) {
        const r2 = await fetch("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${storedKey}` },
        });
        if (r2.ok) {
          const d = await r2.json();
          if (d.email) setUser(d);
        }
      }
    }
    check();
  }, [initialUser]);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    localStorage.removeItem("apiKey");
    setUser(null);
    window.location.href = "/";
  }

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex gap-4 text-sm items-center">
      <a href="/" className="font-bold hover:text-zinc-500">LLM Aggregator</a>
      <a href="/docs" className="font-medium hover:text-zinc-500">API</a>
      <a href="/connect" className="font-medium hover:text-zinc-500">Connect</a>
      <div className="ml-auto flex gap-4 items-center">
        {user ? (
          <>
            <Link href="/dashboard" className="font-medium hover:text-zinc-500">Dashboard</Link>
            <button onClick={logout} className="text-xs text-zinc-400 hover:text-red-500">退出</button>
          </>
        ) : (
          <>
            <Link href="/login" className="font-medium hover:text-zinc-500">Login</Link>
            <Link href="/register" className="rounded-lg bg-zinc-900 text-white px-3 py-1 text-xs font-medium hover:bg-zinc-700">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
