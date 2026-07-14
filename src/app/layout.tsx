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
        <nav className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex gap-4 text-sm items-center">
          <a href="/" className="font-bold hover:text-zinc-500">LLM Aggregator</a>
          <a href="/docs" className="font-medium hover:text-zinc-500">API</a>
          <a href="/connect" className="font-medium hover:text-zinc-500">Connect</a>
          <div className="ml-auto flex gap-4">
            <a href="/login" className="font-medium hover:text-zinc-500">Login</a>
            <a href="/register" className="rounded-lg bg-zinc-900 text-white px-3 py-1 text-xs font-medium hover:bg-zinc-700">Register</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
