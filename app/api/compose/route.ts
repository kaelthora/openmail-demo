import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type DraftSuggestion = { tone: string; text: string };

function localDraftSuggestions(draft: string, tone: string): DraftSuggestion[] {
  const trimmed = draft.trim();
  const closing =
    tone === "Casual"
      ? "Thanks,\n"
      : tone === "Friendly"
        ? "Warm regards,\n"
        : tone === "Direct"
          ? "Regards,\n"
          : "Best regards,\n";
  return [
    { tone, text: trimmed },
    { tone, text: `${trimmed}\n\n${closing}` },
    {
      tone,
      text: `${trimmed.split("\n").filter(Boolean).slice(0, 5).join("\n")}\n\n${closing}`,
    },
  ];
}

function parseSuggestionsFromModel(
  output: string,
  defaultTone: string
): DraftSuggestion[] | null {
  const cleaned = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned) as {
      suggestions?: unknown;
    };
    if (!Array.isArray(parsed.suggestions)) return null;
    const out: DraftSuggestion[] = [];
    for (const item of parsed.suggestions) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { tone?: unknown; text?: unknown };
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) continue;
      const t =
        typeof rec.tone === "string" && rec.tone.trim()
          ? rec.tone.trim()
          : defaultTone;
      out.push({ tone: t, text });
      if (out.length >= 3) break;
    }
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      context?: string;
      tone?: string;
      action?: string;
      draft?: string;
      length?: string;
    };
    const { context, tone, action, draft, length } = body;
    const toneStr = typeof tone === "string" && tone.trim() ? tone.trim() : "Professional";

    if (action === "draft_suggestions") {
      const draftText = typeof draft === "string" ? draft.trim() : "";
      if (!draftText) {
        return NextResponse.json({ suggestions: [] });
      }

      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({
          suggestions: localDraftSuggestions(draftText, toneStr),
        });
      }

      const lengthHint =
        length === "short"
          ? "Keep each alternative concise—similar length or shorter than the draft unless the draft is already very short."
          : "Each alternative may be fuller and more detailed than the draft when it improves clarity.";

      const instruction = `You are an email writing assistant. The user selected tone: "${toneStr}".

Their current email draft:
---
${draftText}
---

${lengthHint}

Produce exactly 3 alternative full email versions. Preserve the user's meaning and intent; improve clarity and flow. All 3 must match the "${toneStr}" tone. Make each version meaningfully different (structure, emphasis, or phrasing).

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{"suggestions":[{"tone":"${toneStr}","text":"first complete email"},{"tone":"${toneStr}","text":"second"},{"tone":"${toneStr}","text":"third"}]}`;

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: instruction,
      });

      const outputText = response.output_text ?? "";
      const parsed = parseSuggestionsFromModel(outputText, toneStr);
      const suggestions =
        parsed && parsed.length >= 2
          ? parsed
          : localDraftSuggestions(draftText, toneStr);

      return NextResponse.json({ suggestions });
    }

    let instruction = "";

    if (action === "reply") {
      instruction = `Write a clear and natural email reply.\nTone: ${toneStr}\n\nEmail:\n${context}`;
    }

    if (action === "improve") {
      instruction = `Improve this email:\n${context}`;
    }

    if (action === "shorten") {
      instruction = `Rewrite this email shorter:\n${context}`;
    }

    if (action === "tone") {
      instruction = `Rewrite this email with a ${toneStr} tone:\n${context}`;
    }

    if (!instruction) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: instruction,
    });

    return NextResponse.json({
      text: response.output_text,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message });
  }
}
