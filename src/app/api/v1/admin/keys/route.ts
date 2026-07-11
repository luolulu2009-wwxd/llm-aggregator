export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { uploadProviderKey, listProviderKeys } from "@/lib/keys";

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: { message: "Unauthorized", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  const { provider, modelFamily, keyValue, dailyLimit } = await req.json();

  if (!provider || !modelFamily || !keyValue) {
    return Response.json(
      { error: { message: "provider, modelFamily, and keyValue are required", type: "invalid_request_error", code: 400 } },
      { status: 400 },
    );
  }

  try {
    const key = await uploadProviderKey({
      userId: auth.userId,
      provider,
      modelFamily,
      keyValue,
      dailyLimit: dailyLimit || 1_000_000,
    });

    return Response.json({ id: key.id, provider: key.provider, modelFamily: key.modelFamily, status: key.status }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: { message: err instanceof Error ? err.message : "Failed to upload key", type: "invalid_request_error", code: 400 } },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: { message: "Unauthorized", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  const keys = await listProviderKeys(auth.userId);
  return Response.json({ data: keys });
}
