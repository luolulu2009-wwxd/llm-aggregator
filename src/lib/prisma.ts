import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
}

let _prisma: PrismaClient | undefined;

/**
 * Lazy Prisma client. Only connects on first query, not at import time.
 * This prevents build-time database connection errors.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop: string) {
    if (!_prisma) {
      if (globalForPrisma.prisma) {
        _prisma = globalForPrisma.prisma;
      } else {
        _prisma = createPrisma();
        if (process.env.NODE_ENV !== "production") {
          globalForPrisma.prisma = _prisma;
        }
      }
    }
    return (_prisma as any)[prop];
  },
});
