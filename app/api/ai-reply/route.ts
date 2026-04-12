import { NextResponse } from "next/server";
import {
  generateGuardianSafeReply,
  generateReply,
  generateReplySuggestions,
} from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email : "";
    const tone = typeof body.tone === "string" ? body.tone : "Professional";
    const risk = typeof body.risk === "string" ? body.risk : "safe";
    const modeRaw = typeof body.mode === "string" ? body.mode : "single";
    const mode =
      modeRaw === "suggestions"
        ? "suggestions"
        : modeRaw === "guardian"
          ? "guardian"
          : "single";

    if (!email.trim()) {
      return NextResponse.json(
        { error: "Missing email content" },
        { status: 400 }
      );
    }

    if (mode === "suggestions") {
      const suggestions = await generateReplySuggestions({ email, tone, risk });
      return NextResponse.json({ suggestions });
    }

    if (mode === "guardian") {
      const reply = await generateGuardianSafeReply({ email, risk });
      return NextResponse.json({ reply });
    }

    const reply = await generateReply({ email, tone, risk });
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[api/ai-reply]", e);
    const message =
      e instanceof Error ? e.message : "Failed to generate reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
