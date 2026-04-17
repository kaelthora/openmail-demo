import { NextResponse } from "next/server";

/** Liveness for clients that require every call under `/api/*`. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
