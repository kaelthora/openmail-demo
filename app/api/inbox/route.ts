import { NextResponse } from "next/server";
import {
  jsonMailInboxListResponse,
  parseInboxFetchRequest,
} from "@/lib/mailInboxHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleInbox(request: Request) {
  const parsed = await parseInboxFetchRequest(request);
  if (!parsed.ok) {
    const errBody = (await parsed.response.json().catch(() => ({}))) as {
      error?: string;
    };
    return NextResponse.json(
      {
        ok: false,
        error: errBody.error || "Bad request",
        emails: [] as unknown[],
      },
      { status: parsed.response.status }
    );
  }

  const inner = await jsonMailInboxListResponse(parsed.accountId);
  const status = inner.status;
  const body = (await inner.json()) as {
    emails?: unknown[];
    setupRequired?: boolean;
    error?: string;
  };

  const hasError = typeof body.error === "string" && body.error.length > 0;
  const ok = status >= 200 && status < 400 && !hasError;

  return NextResponse.json(
    {
      ok,
      emails: body.emails ?? [],
      ...(body.setupRequired === true ? { setupRequired: true } : {}),
      ...(hasError ? { error: body.error } : {}),
    },
    { status }
  );
}

export async function GET(request: Request) {
  return handleInbox(request);
}

export async function POST(request: Request) {
  return handleInbox(request);
}
