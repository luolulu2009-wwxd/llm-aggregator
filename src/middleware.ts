import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // CORS: allow dashboard + API access from browser
  const origin = req.headers.get("origin") || "*";
  const res = NextResponse.next();

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.headers.set("Access-Control-Expose-Headers", "X-Route-Reason, X-Effective-Model, X-RateLimit-Remaining");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: "/api/:path*",
};
