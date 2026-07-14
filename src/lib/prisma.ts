import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrisma(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter: new PrismaPg(pool) } as any);
}

// Lazy init — prevents build-time DB connection
let _prisma: PrismaClient | undefined;
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop: string) {
    if (!_prisma) {
      _prisma = globalForPrisma.prisma ?? createPrisma();
      if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = _prisma;
    }
    const val = (_prisma as any)[prop];
    return typeof val === "function" ? val.bind(_prisma) : val;
  },
});
