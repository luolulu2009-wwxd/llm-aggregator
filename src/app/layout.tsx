import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "LLM Aggregator",
  description: "一个 Key，所有模型",
};

async function getInitialUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return null;
    const secret = new TextEncoder().encode(
      process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
    );
    const { payload } = await jwtVerify(token, secret);
    return { email: payload.email as string };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getInitialUser();

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Nav initialUser={initialUser} />
        {children}
      </body>
    </html>
  );
}
