"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export function Nav() {
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.email) setUser(d); })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
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
