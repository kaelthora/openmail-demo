import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/** SQLite on Railway: writable ephemeral disk (not `./prisma/`). */
const SQLITE_TMP = "file:/tmp/dev.db";

function filePathFromSqliteDatabaseUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const rest = url.slice("file:".length);
  if (rest.startsWith("/")) return rest;
  if (rest.startsWith("//")) {
    try {
      return new URL(url).pathname;
    } catch {
      return null;
    }
  }
  return null;
}

function ensureSqliteParentDir(url: string): void {
  const filePath = filePathFromSqliteDatabaseUrl(url);
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (e) {
    console.error("[openmail][db] mkdirSync failed:", path.dirname(filePath), e);
  }
}

/**
 * `schema.prisma` uses `url = env("DATABASE_URL")`. Prisma errors if it is unset.
 * Never use `./prisma/dev.db` here (broken on Railway cwd / permissions).
 * Default or normalize to `file:/tmp/dev.db` and ensure `/tmp` exists before Prisma loads.
 */
function ensureDatabaseUrl(): void {
  let v = typeof process.env.DATABASE_URL === "string" ? process.env.DATABASE_URL.trim() : "";
  const isRepoSqlite =
    !v ||
    v.includes("prisma/dev.db") ||
    v.startsWith("file:./prisma/") ||
    v.startsWith("file:./prisma");
  if (isRepoSqlite) {
    process.env.DATABASE_URL = SQLITE_TMP;
    console.warn(
      "[openmail][db] DATABASE_URL unset or pointed at prisma/dev.db; using",
      SQLITE_TMP
    );
    v = SQLITE_TMP;
  }
  ensureSqliteParentDir(process.env.DATABASE_URL ?? SQLITE_TMP);
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
