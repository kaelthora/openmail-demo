import { NextResponse } from "next/server";
// DEMO MODE: Prisma disabled for Vercel deployment (stub in lib/db.ts)
import { prisma } from "@/lib/db";
import { createEmptyMemory, parseBehaviorMemory } from "@/lib/userBehaviorMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileKey = searchParams.get("profileKey")?.trim();
  if (!profileKey) {
    return NextResponse.json({ error: "profileKey required" }, { status: 400 });
  }
  try {
    const row = await prisma.userBehaviorProfile.findUnique({
      where: { profileKey },
    });
    if (!row) {
      return NextResponse.json({ memory: null });
    }
    return NextResponse.json({
      memory: row.memory,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const profileKey =
      typeof o.profileKey === "string" ? o.profileKey.trim() : "";
    if (!profileKey) {
      return NextResponse.json({ error: "profileKey required" }, { status: 400 });
    }
    const memory = parseBehaviorMemory(o.memory ?? createEmptyMemory());
    await prisma.userBehaviorProfile.upsert({
      where: { profileKey },
      create: {
        profileKey,
        memory: memory as unknown as object,
      },
      update: {
        memory: memory as unknown as object,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
