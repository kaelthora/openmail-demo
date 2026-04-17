import { NextResponse } from "next/server";
import {
  executeMailConnectAccountPost,
  type MailConnectAccountBody,
} from "@/lib/mailConnectAccountExecute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: MailConnectAccountBody;
  try {
    body = (await request.json()) as MailConnectAccountBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const normalized: MailConnectAccountBody = {
    ...body,
    mode: body.mode ?? "auto",
  };

  return executeMailConnectAccountPost(normalized);
}
