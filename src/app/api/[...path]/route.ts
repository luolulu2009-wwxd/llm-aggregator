import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  return handleProxy(req);
}

export async function GET(req: NextRequest) {
  return handleProxy(req);
}

export async function PUT(req: NextRequest) {
  return handleProxy(req);
}

export async function DELETE(req: NextRequest) {
  return handleProxy(req);
}

export async function PATCH(req: NextRequest) {
  return handleProxy(req);
}

async function handleProxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace("/api/", "");
  const url = `https://api.anthropic.com/api/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!["host", "connection", "content-length"].includes(lower)) {
      headers[key] = value;
    }
  });

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
    const resp = await fetch(url, { method: req.method, headers, body });

    const respHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });

    return new Response(resp.body, { status: resp.status, headers: respHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Proxy error: ${e.message}` }), { status: 502 });
  }
}
