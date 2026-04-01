declare module "mailparser" {
  import type { Readable } from "stream";

  export interface ParsedMail {
    text?: string;
    html?: string | false;
    messageId?: string;
  }

  export function simpleParser(
    source: Buffer | string | Readable
  ): Promise<ParsedMail>;
}
