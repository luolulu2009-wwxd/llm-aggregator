export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jwtVerify } from "jose";
import { uploadProviderKey, listProviderKeys } from "@/lib/keys";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

async function getUserId(req: NextRequest): Promise<string | null> {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (auth) return auth.userId;
  const token = req.cookies.get("auth_token")?.value;
  if (token) { try { const { payload } = await jwtVerify(token, JWT_SECRET); return payload.userId as string; } catch {} }
  return null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: { message: "请先登录", type: "authentication_error", code: 401 } }, { status: 401 });

  const { provider, modelFamily, keyValue, dailyLimit } = await req.json();
  if (!provider || !keyValue) {
    return Response.json({ error: { message: "provider 和 keyValue 为必填项", type: "invalid_request_error", code: 400 } }, { status: 400 });
  }

  try {
    const key = await uploadProviderKey({ userId, provider, modelFamily: modelFamily || `${provider}-default`, keyValue, dailyLimit: dailyLimit || 1_000_000 });
    return Response.json({ id: key.id, provider: key.provider, modelFamily: key.modelFamily, status: key.status }, { status: 201 });
  } catch (err) {
    return Response.json({ error: { message: err instanceof Error ? err.message : "上传失败", type: "invalid_request_error", code: 400 } }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: { message: "请先登录", type: "authentication_error", code: 401 } }, { status: 401 });
  const keys = await listProviderKeys(userId);
  return Response.json({ data: keys });
}
