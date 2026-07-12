import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Aggregator",
  description: "一个 Key，所有模型",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex gap-4 text-sm">
          <a href="/" className="font-medium hover:text-zinc-500">Home</a>
          <a href="/docs" className="font-medium hover:text-zinc-500">API</a>
          <a href="/topup" class="font-medium hover:text-zinc-500">Topup</a>
          <a href="/register" className="font-medium hover:text-zinc-500">Register</a>
          <a href="/dashboard" className="font-medium hover:text-zinc-500">Dashboard</a>
          <a href="/dashboard/keys" className="font-medium hover:text-zinc-500">Keys</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
