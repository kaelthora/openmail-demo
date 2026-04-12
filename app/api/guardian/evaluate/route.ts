import { NextResponse } from "next/server";
import {
  guardianEvaluate,
  type GuardianAction,
} from "@/lib/guardianEngine";
import { recordGuardianTraceDev } from "@/lib/guardianTrace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: GuardianAction[] = [
  "open_mail",
  "click_link",
  "open_attachment",
  "send_email",
];

function isAction(v: unknown): v is GuardianAction {
  return typeof v === "string" && (ACTIONS as string[]).includes(v);
}

/**
 * POST /api/guardian/evaluate
 * Body: { action, payload }
 * Response: { ok: true, action, decision, reason, rule? }
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  const body = json as Record<string, unknown>;
  const action = body.action;
  const payload = body.payload;

  if (!isAction(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid action. Expected one of: ${ACTIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const result = guardianEvaluate(action, payload);
  const trace = recordGuardianTraceDev(result, "api:evaluate");
  return NextResponse.json({ ok: true, ...result, trace });
}
