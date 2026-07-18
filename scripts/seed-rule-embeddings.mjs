/**
 * Seed RouteRule embeddings with rich natural-language descriptions.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createDecipheriv, scryptSync } from "crypto";
import { ProxyAgent } from "undici";

const PROXY_URL = process.env.ANTHROPIC_PROXY || "";
const ALGORITHM = "aes-256-gcm";
const SALT = "llm-aggregator-key-encryption";

function getKey() {
  const secret = process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000";
  return scryptSync(secret, SALT, 32);
}

function decrypt(encrypted) {
  const key = getKey();
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

// Rich Chinese descriptions matching the query language
const RULE_DESCRIPTIONS = {
  code: "写代码、编程、调试bug、实现算法、开发软件、写函数、写类、导入模块。涉及Python、JavaScript、TypeScript、Rust、React等编程语言和技术。",
  translate: "翻译文本、中英文互译、日语翻译、法语翻译、德语翻译、多语言转换。语言翻译和本地化任务。",
  summary: "总结文章、提取要点、归纳信息、生成摘要、概括内容、提炼关键信息。TLDR和内容压缩。",
  creative: "创意写作、编故事、写剧本、写诗歌、角色扮演、写文案、写广告语、写小说、编相声、编小品。艺术创作和内容生成。",
  reasoning: "逻辑推理、数学证明、分析思考、逐步解题、批判分析、定理证明、复杂推理和论证。",
};

async function getEmbedding(text, apiKey) {
  const dispatcher = PROXY_URL ? new ProxyAgent({ uri: PROXY_URL }) : undefined;
  const fetchFn = dispatcher ? (await import("undici")).fetch : fetch;
  const res = await fetchFn("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    ...(dispatcher ? { dispatcher } : {}),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text().slice(0, 200)}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const key = await prisma.providerKey.findFirst({ where: { provider: "openai", status: "active" } });
  if (!key) { console.log("No active OpenAI key"); process.exit(1); }

  const apiKey = decrypt(key.keyEncrypted);
  console.log("Generating rich embeddings for RouteRules...");

  for (const [intent, desc] of Object.entries(RULE_DESCRIPTIONS)) {
    console.log(`  ${intent}: "${desc.slice(0, 80)}..."`);
    try {
      const emb = await getEmbedding(desc, apiKey);
      const vectorStr = `[${emb.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "RouteRule" SET embedding = $1::vector WHERE intent = $2 AND "isActive" = true`,
        vectorStr, intent
      );
      console.log(`  ✅ ${intent} (${emb.length} dims)`);
    } catch (e) {
      console.error(`  ❌ ${intent}: ${e.message}`);
    }
  }

  console.log("Done — semantic routing active.");
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
