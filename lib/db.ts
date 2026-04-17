import { PrismaClient } from "@prisma/client";

/**
 * `schema.prisma` uses `url = env("DATABASE_URL")`. If it is unset, Prisma throws
 * before any query (e.g. `findUnique`). Default to the repo SQLite file used locally
 * (`prisma/dev.db` is gitignored — created by `prisma migrate` / first write).
 */
function ensureDatabaseUrl(): void {
  const v = process.env.DATABASE_URL;
  if (typeof v === "string" && v.trim().length > 0) return;
  process.env.DATABASE_URL = "file:./prisma/dev.db";
  console.warn(
    "[openmail][db] DATABASE_URL was missing or empty; defaulting to",
    process.env.DATABASE_URL
  );
}

ensureDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
