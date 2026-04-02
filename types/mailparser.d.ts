declare module "mailparser" {
  import type { Readable } from "stream";

  export interface Attachment {
    type?: string;
    filename?: string | false;
    contentType?: string;
    size?: number;
    content?: Buffer;
    length?: number;
  }

  export interface ParsedMail {
    text?: string;
    html?: string | false;
    messageId?: string;
    attachments?: Attachment[];
  }

  export function simpleParser(
    source: Buffer | string | Readable
  ): Promise<ParsedMail>;
}
