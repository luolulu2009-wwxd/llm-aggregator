/**
 * Memory orchestration — conversation CRUD, context injection, fragment creation.
 */
import { prisma } from "./prisma";
import { generateEmbedding, getQueryEmbedding } from "./embedding";
import { storeMemoryFragment, searchMemoryFragments, countUserFragments, deleteOldestFragments } from "./vectorstore";
import { randomUUID } from "crypto";

const MAX_FRAGMENTS_PER_USER = 500;
const MIN_CHARS_FOR_FRAGMENT = 50;

// ── Conversation CRUD ──

export async function listConversations(userId: string, take = 20, cursor?: string) {
  const where: any = { userId };
  if (cursor) where.updatedAt = { lt: new Date(cursor) };

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    select: {
      id: true, title: true, modelSlug: true, createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  const hasMore = conversations.length > take;
  if (hasMore) conversations.pop();

  return {
    data: conversations,
    hasMore,
    nextCursor: hasMore ? conversations[conversations.length - 1]?.updatedAt?.toISOString() : null,
  };
}

export async function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: { userId, title: title || null },
  });
}

export async function getConversation(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) throw new Error("Not found");
  return prisma.conversation.delete({ where: { id: conversationId } });
}

export async function updateConversationTitle(conversationId: string, userId: string, title: string) {
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) throw new Error("Not found");
  return prisma.conversation.update({ where: { id: conversationId }, data: { title } });
}

// ── Message persistence ──

export async function saveMessages(input: {
  conversationId: string;
  messages: { role: string; content: string }[];
  provider?: string;
  modelSlug?: string;
}) {
  // Only save the last user + assistant pair (not full history every time)
  const recent = input.messages.slice(-4); // last 2 exchanges max
  const rows = recent.map(m => ({
    conversationId: input.conversationId,
    role: m.role,
    content: m.content.slice(0, 8000),
    provider: input.provider,
    modelSlug: input.modelSlug,
    tokenCount: Math.ceil(m.content.length / 3), // rough estimate
  }));

  await prisma.message.createMany({ data: rows });

  // Update conversation timestamp and model
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { modelSlug: input.modelSlug, updatedAt: new Date() },
  });
}

// ── Memory context injection ──

export function formatMemoryContext(
  fragments: Array<{ content: string; similarity: number }>,
): string {
  if (!fragments.length) return "";

  const items = fragments.map((f, i) =>
    `${i + 1}. [相关性: ${(f.similarity * 100).toFixed(0)}%] ${f.content.slice(0, 600)}`
  ).join("\n\n");

  return `[长期记忆 — 以下是用户之前的相关对话片段，供你参考。不要主动提及"记忆"或"之前"，直接利用这些上下文更好地回答。]\n\n${items}`;
}

export function injectMemoryIntoMessages(
  messages: { role: string; content: string }[],
  memoryContext: string,
): { role: string; content: string }[] {
  if (!memoryContext) return messages;

  const systemIdx = messages.findIndex(m => m.role === "system");
  if (systemIdx >= 0) {
    const updated = [...messages];
    updated[systemIdx] = {
      role: "system",
      content: messages[systemIdx].content + "\n\n" + memoryContext,
    };
    return updated;
  }

  return [{ role: "system", content: memoryContext }, ...messages];
}

// ── Memory retrieval (called during request) ──

export async function retrieveMemory(
  userMessage: string,
  userId: string,
): Promise<string | null> {
  if (userMessage.length < 5) return null;

  try {
    const embedding = await getQueryEmbedding(userMessage);
    const fragments = await searchMemoryFragments(embedding, userId, 5, 0.35);
    if (!fragments.length) return null;
    return formatMemoryContext(fragments);
  } catch {
    return null; // memory failure never blocks the request
  }
}

// ── Memory creation (fire-and-forget after response) ──

export async function createMemoryFragments(input: {
  userId: string;
  conversationId: string;
  messages: { role: string; content: string }[];
  responseContent: string;
  modelSlug: string;
}): Promise<void> {
  try {
    const allContent = [
      ...input.messages.slice(-4).map(m => `${m.role}: ${m.content.slice(0, 500)}`),
      `assistant: ${input.responseContent.slice(0, 500)}`,
    ].join("\n");

    if (allContent.length < MIN_CHARS_FOR_FRAGMENT) return;

    const count = await countUserFragments(input.userId);
    if (count >= MAX_FRAGMENTS_PER_USER) {
      await deleteOldestFragments(input.userId, MAX_FRAGMENTS_PER_USER - 10);
    }

    const result = await generateEmbedding(allContent);
    await storeMemoryFragment({
      id: randomUUID(),
      conversationId: input.conversationId,
      userId: input.userId,
      content: allContent.slice(0, 2000),
      embedding: result.embedding,
      startIndex: Math.max(0, input.messages.length - 4),
      endIndex: input.messages.length,
      modelSlug: input.modelSlug,
    });
  } catch {
    // silent — memory creation is non-critical
  }
}
