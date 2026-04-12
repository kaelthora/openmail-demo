import {
  jsonMailInboxListResponse,
  parseInboxFetchRequest,
} from "@/lib/mailInboxHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = await parseInboxFetchRequest(request);
  if (!parsed.ok) return parsed.response;
  return jsonMailInboxListResponse(parsed.accountId);
}

export async function POST(request: Request) {
  const parsed = await parseInboxFetchRequest(request);
  if (!parsed.ok) return parsed.response;
  return jsonMailInboxListResponse(parsed.accountId);
}
