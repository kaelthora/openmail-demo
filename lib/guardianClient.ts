"use client";

import type { GuardianAction, GuardianEvaluateResult } from "@/lib/guardianEngine";
import type { GuardianTraceEntry } from "@/lib/guardianTrace";
import { apiUrl } from "@/lib/config";

type ApiOk = { ok: true } & GuardianEvaluateResult & { trace?: GuardianTraceEntry };
type ApiErr = { ok: false; error?: string };

/** Result of `fetchGuardianEvaluate`, including optional server trace payload. */
export type FetchGuardianEvaluateResult = GuardianEvaluateResult & {
  trace?: GuardianTraceEntry;
};

/**
 * Remote Guardian check (same logic as `guardianEvaluate` on server).
 * Use when you need an auditable round-trip; otherwise import `guardianEvaluate` directly.
 */
export async function fetchGuardianEvaluate(
  action: GuardianAction,
  payload: unknown
): Promise<FetchGuardianEvaluateResult> {
  const res = await fetch(apiUrl("/api/guardian/evaluate"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = (await res.json()) as ApiOk | ApiErr;
  if (!res.ok || !data.ok) {
    throw new Error(
      !data.ok ? data.error || "Guardian request failed" : "Guardian request failed"
    );
  }
  const { ok: _ok, ...rest } = data;
  return rest;
}
