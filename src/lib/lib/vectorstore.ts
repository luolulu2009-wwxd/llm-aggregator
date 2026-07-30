/**
 * pgvector operations — store and search memory fragments.
 * Uses raw SQL because Prisma 5 cannot handle the vector type natively.
 */
import { prisma } from "./prisma";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const SIMILARITY_THRESHOLD = 0.35;

export async function storeMemoryFragment(input: {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  embedding: number[];
  startIndex: number;
  endIndex: number;
  modelSlug?: string;
}): Promise<void> {
  const vectorStr = `[${input.embedding.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "MemoryFragment" (id, "conversationId", "userId", content, embedding, "startIndex", "endIndex", "modelSlug", "createdAt")
     VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, NOW())`,
    input.id,
    input.conversationId,
    input.userId,
    input.content,
    vectorStr,
    input.startIndex,
    input.endIndex,
    input.modelSlug || null,
  );
}

export async function searchMemoryFragments(
  queryEmbedding: number[],
  userId: string,
  limit: number = DEFAULT_LIMIT,
  threshold: number = SIMILARITY_THRESHOLD,
): Promise<Array<{
  id: string;
  conversationId: string;
  content: string;
  similarity: number;
  startIndex: number;
  endIndex: number;
}>> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const clampedLimit = Math.min(limit, MAX_LIMIT);

  const results = await prisma.$queryRawUnsafe<Array<{
    id: string;
    conversationId: string;
    content: string;
    similarity: number;
    startIndex: number;
    endIndex: number;
  }>>(
    `SELECT
       id,
       "conversationId",
       content,
       1 - (embedding <=> $1::vector) AS similarity,
       "startIndex",
       "endIndex"
     FROM "MemoryFragment"
     WHERE "userId" = $2
       AND 1 - (embedding <=> $1::vector) > $3
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    vectorStr,
    userId,
    threshold,
    clampedLimit,
  );

  return results;
}

export async function countUserFragments(userId: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM "MemoryFragment" WHERE "userId" = $1`,
    userId,
  );
  return Number(result[0]?.count || 0);
}

export async function deleteOldestFragments(userId: string, keepCount: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "MemoryFragment"
     WHERE id IN (
       SELECT id FROM "MemoryFragment"
       WHERE "userId" = $1
       ORDER BY "createdAt" ASC
       LIMIT (
         SELECT GREATEST(0, COUNT(*) - $2) FROM "MemoryFragment" WHERE "userId" = $1
       )
     )`,
    userId,
    keepCount,
  );
}
