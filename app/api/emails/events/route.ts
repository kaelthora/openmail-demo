import { subscribeMailRealtime } from "@/lib/mailRealtimeHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_MS = 25_000;

/**
 * Server-Sent Events: pushes `new_mail` when the IMAP watcher ingests messages.
 * Client reconnects automatically if the stream drops.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const { signal } = request;

  const stream = new ReadableStream({
    start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };

      write({ type: "hello", t: Date.now() });

      const ping = setInterval(() => {
        write({ type: "ping", t: Date.now() });
      }, PING_MS);

      const unsub = subscribeMailRealtime((ev) => {
        write(ev);
      });

      const close = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
