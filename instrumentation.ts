export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { startImapRealtimeWatch } = await import("@/lib/imapRealtimeWatch");
    startImapRealtimeWatch();
  } catch (e) {
    console.error("[openmail] instrumentation: IMAP realtime failed:", e);
  }
}
