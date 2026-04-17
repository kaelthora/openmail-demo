import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
    console.error("[openmail][prismaEnv] mkdirSync failed:", path.dirname(filePath), e);
  }
}

/**
 * `schema.prisma` uses `url = env("DATABASE_URL")`. Prisma errors if it is unset.
 * Never use `./prisma/dev.db` here (broken on Railway cwd / permissions).
 * Default or normalize to `file:/tmp/dev.db` and ensure `/tmp` exists before Prisma loads.
 */
export function ensureDatabaseUrl(): void {
  let v = typeof process.env.DATABASE_URL === "string" ? process.env.DATABASE_URL.trim() : "";
  const isRepoSqlite =
    !v ||
    v.includes("prisma/dev.db") ||
    v.startsWith("file:./prisma/") ||
    v.startsWith("file:./prisma");
  if (isRepoSqlite) {
    process.env.DATABASE_URL = SQLITE_TMP;
    console.warn(
      "[openmail][prismaEnv] DATABASE_URL unset or pointed at prisma/dev.db; using",
      SQLITE_TMP
    );
    v = SQLITE_TMP;
  }
  ensureSqliteParentDir(process.env.DATABASE_URL ?? SQLITE_TMP);
}

const globalBoot = globalThis as typeof globalThis & {
  __openmailPrismaDbPushDone?: boolean;
};

/**
 * Run once when the Node server boots (see `instrumentation.ts`), not during `next build` workers.
 * Creates `Account` and other tables on the same SQLite file as `DATABASE_URL`.
 */
export function runPrismaDbPushOnceAtServerBoot(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (globalBoot.__openmailPrismaDbPushDone) return;
  globalBoot.__openmailPrismaDbPushDone = true;
  ensureDatabaseUrl();
  try {
    execSync("npx prisma db push --accept-data-loss", {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    console.info("[openmail][prismaEnv] prisma db push completed");
  } catch (e) {
    console.error("[openmail][prismaEnv] prisma db push failed:", e);
  }
}
