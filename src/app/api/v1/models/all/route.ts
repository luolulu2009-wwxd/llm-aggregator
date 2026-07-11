export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const models = await prisma.model.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      provider: true,
      name: true,
      inputPrice: true,
      outputPrice: true,
      contextWindow: true,
      maxOutputTokens: true,
      capabilities: true,
      status: true,
    },
  });

  return Response.json({
    data: models.map((m) => ({
      ...m,
      inputPrice: Number(m.inputPrice),
      outputPrice: Number(m.outputPrice),
    })),
  });
}
