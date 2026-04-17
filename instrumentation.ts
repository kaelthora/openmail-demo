export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NODE_ENV === "production") {
    const { runPrismaDbPushOnceAtServerBoot } = await import("@/lib/prismaEnv");
    runPrismaDbPushOnceAtServerBoot();
  }
  if (process.env.NODE_ENV !== "production") {
    const { ZERO_TRACKING } = await import("@/lib/zeroTracking");
    if (ZERO_TRACKING) {
      console.info("[openmail] ZERO_TRACKING policy active (no analytics / no leaky logs)");
    }
  }
  try {
    const { startImapRealtimeWatch } = await import("@/lib/imapRealtimeWatch");
    startImapRealtimeWatch();
  } catch {
    console.error("[openmail] instrumentation: IMAP realtime failed [redacted]");
  }
}
