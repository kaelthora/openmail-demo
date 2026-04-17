import { NextResponse } from "next/server";
import { testImap } from "@/lib/testImap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  const cleanPassword = password.replace(/\s/g, "");

  try {
    await testImap(email, cleanPassword, 2);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "IMAP connection failed: Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
