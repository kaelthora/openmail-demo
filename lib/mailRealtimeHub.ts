import { EventEmitter } from "node:events";

export type MailRealtimeEvent =
  | { type: "new_mail"; inserted: number; ids: string[] }
  | { type: "imap_status"; state: "connected" | "reconnecting" | "stopped"; detail?: string };

const CHANNEL = "mail";
const hub = new EventEmitter();
hub.setMaxListeners(200);

export function emitMailRealtime(event: MailRealtimeEvent): void {
  hub.emit(CHANNEL, event);
}

export function subscribeMailRealtime(
  handler: (event: MailRealtimeEvent) => void
): () => void {
  const fn = (ev: MailRealtimeEvent) => handler(ev);
  hub.on(CHANNEL, fn);
  return () => {
    hub.off(CHANNEL, fn);
  };
}
