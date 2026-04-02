import { simpleParser } from "mailparser";

export type ParsedAttachmentMeta = {
  filename: string;
  type: string;
  size: number;
};

export type ParsedMimeResult = {
  /** Plain text body (preferred over raw RFC822) */
  text: string;
  /** HTML part, truncated for storage */
  html: string | null;
  attachments: ParsedAttachmentMeta[];
};

const MAX_HTML_STORE = 512 * 1024;
const MAX_TEXT_LEN = 400_000;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAttachments(parsed: {
  attachments?: Array<{
    filename?: string | false;
    contentType?: string;
    size?: number;
    content?: Buffer;
    length?: number;
  }>;
}): ParsedAttachmentMeta[] {
  const raw = parsed.attachments;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: ParsedAttachmentMeta[] = [];
  for (const a of raw) {
    const filename =
      typeof a.filename === "string" && a.filename.trim()
        ? a.filename.trim()
        : "attachment";
    const type =
      typeof a.contentType === "string" && a.contentType.trim()
        ? a.contentType.trim()
        : "application/octet-stream";
    let size = typeof a.size === "number" && a.size >= 0 ? a.size : 0;
    if (size === 0 && Buffer.isBuffer(a.content)) {
      size = a.content.length;
    }
    if (size === 0 && typeof a.length === "number") {
      size = a.length;
    }
    out.push({ filename, type, size });
  }
  return out;
}

/**
 * Parse raw RFC822 / MIME source into clean text, optional HTML, and attachment metadata.
 */
export async function parseMimeSource(source: Buffer | string): Promise<ParsedMimeResult> {
  try {
    const parsed = await simpleParser(source);

    let text = "";
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      text = parsed.text.trim();
    } else if (typeof parsed.html === "string" && parsed.html) {
      text = stripHtmlToText(parsed.html);
    }

    if (text.length > MAX_TEXT_LEN) {
      text = `${text.slice(0, MAX_TEXT_LEN)}…`;
    }

    let html: string | null = null;
    if (typeof parsed.html === "string" && parsed.html.trim()) {
      const h = parsed.html.trim();
      html = h.length > MAX_HTML_STORE ? `${h.slice(0, MAX_HTML_STORE)}…` : h;
    }

    const attachments = normalizeAttachments(parsed);

    return { text, html, attachments };
  } catch {
    return { text: "", html: null, attachments: [] };
  }
}
