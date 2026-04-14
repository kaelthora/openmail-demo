"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProcessedMail } from "@/lib/mailTypes";
import { buildCoreDetectionReasons, coreMailPreviewPlain } from "@/lib/openmailCoreUi";
import { getReplyAssistUiState } from "@/lib/openmailAutoReplyUi";
import {
  guardianAutoResponseDescription,
  type GuardianAutoResponseMode,
} from "@/lib/guardianAutoResponse";
import { useOpenmailPreferences } from "../OpenmailPreferencesProvider";
import { useOpenmailTheme } from "../OpenmailThemeProvider";
import { getMailAiRiskBand } from "@/lib/mailContentSecurity";
import type { CoreRecommendedAction, ReplyState, ReplyTone } from "./types";

type AIPanelProps = {
  selectedMail: ProcessedMail | null;
  /** When set to the same mail, reply textarea is not auto-focused (reading overlay). */
  readingMailId?: string | null;
  actionLabel: string;
  onProceed: () => void | Promise<void>;
  proceedBusy?: boolean;
  /** Optional: load top suggestion into editor only (small secondary). */
  onApplyTopSuggestion?: () => void;
  onCoreIgnore?: () => void;
  onCoreEscalate?: () => void;
  onCoreReplyWithSuggestion?: () => void;
  onRiskBlockSender?: () => void | Promise<void>;
  onRiskReportPhishing?: () => void | Promise<void>;
  onRiskOpenSandbox?: () => void | Promise<void>;
  onRiskMarkSafe?: () => void | Promise<void>;
  onDecisionBlockAndReport?: () => void | Promise<void>;
  onDecisionArchive?: () => void | Promise<void>;
  riskActionBusy?: "block" | "phishing" | "sandbox" | "safe" | null;
  recommendedCoreAction?: CoreRecommendedAction | null;
  replyState: ReplyState;
  onReplyChange: (text: string) => void;
  onSelectSuggestion: (index: number) => void;
  replyTone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  onSendReply: () => void;
  sending: boolean;
  sendError: string | null;
  sendSuccess: string | null;
  /** Fetches AI reply variants and fills the editor (explicit user action). */
  onGenerateAiReply?: (opts?: { suggestionIndex?: number }) => Promise<void>;
  /** Inserts Guardian-aligned draft text into the editor; never sends. */
  onGuardianAssistDraft?: () => void | Promise<void>;
  aiReplyLoading?: boolean;
  guardianDraftLoading?: boolean;
  guardianAutoResponseMode?: GuardianAutoResponseMode;
  guardianAutoResponseEnabled?: boolean;
};

const TONES: ReplyTone[] = ["Professional", "Friendly", "Direct", "Short"];

type CoreRiskBand = "high" | "medium" | "safe" | "idle";

function coreRiskBand(mail: ProcessedMail | null): CoreRiskBand {
  if (!mail) return "idle";
  const band = getMailAiRiskBand(mail);
  if (band === "high") return "high";
  if (band === "medium") return "medium";
  return "safe";
}

/** One-line snapshot under the risk level (summary / subline). */
function coreRiskSnapshot(mail: ProcessedMail | null): string {
  if (!mail) return "";
  const sub = mail.securityAiSubline?.trim();
  if (sub) return sub;
  const sum = mail.syncedAi?.summary?.trim();
  if (sum) return sum;
  return "";
}

function coreWhyMattersParagraph(
  mail: ProcessedMail | null,
  band: CoreRiskBand
): string {
  if (!mail) {
    return "Pick a message and CORE will explain what matters for that thread.";
  }
  const fromAi =
    mail.syncedAi?.reason?.trim() || mail.securityReason?.trim() || "";
  if (fromAi) return fromAi;
  if (band === "safe") {
    return "No elevated signals flagged. You can treat this like normal mail unless your own policies say otherwise.";
  }
  if (band === "high") {
    return "This message shows strong warning signals. Mistakes here can lead to account compromise or malware.";
  }
  if (band === "medium") {
    return "Something looks off—sender, links, or tone. Extra caution reduces the chance of phishing or fraud.";
  }
  return "Review the signals above before you click, download, or reply.";
}

function coreWhyMattersBullets(mail: ProcessedMail | null, paragraph: string): string[] {
  if (!mail) return [];
  const p = paragraph.trim();
  return mail.securityWhyBullets
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => b !== p && !p.includes(b));
}

const CORE_ONE_TAP_CTA = "Proceed";

/** One scannable line for the Decision Engine action area. */
function decisionEngineHeadline(band: CoreRiskBand): string {
  if (band === "high") {
    return "Stop the threat first—use sandbox only if you still need to inspect content.";
  }
  if (band === "medium") {
    return "Open in a protected preview, or clear the message if you do not need it.";
  }
  if (band === "safe") {
    return "Review suggestions, edit your draft, then send—nothing leaves until you confirm.";
  }
  return "Select a message to see the best next move.";
}

const CORE_RISK_CARD: Record<
  CoreRiskBand,
  {
    border: string;
    bar: string;
    glow: string;
    badge: string;
    badgeLabel: string;
    actionShell: string;
    actionHeading: string;
  }
> = {
  high: {
    border: "border-2 border-rose-800/30 shadow-[0_0_18px_rgba(150,75,80,0.1)]",
    bar: "bg-rose-800/90 shadow-[0_0_8px_rgba(140,72,78,0.2)]",
    glow: "bg-gradient-to-br from-rose-950/40 via-[#110d0d] to-[#0c0c0c]",
    badge:
      "border-rose-700/28 bg-rose-950/32 text-rose-100/95 ring-1 ring-rose-800/18",
    badgeLabel: "HIGH RISK",
    actionShell:
      "border border-rose-800/28 bg-[#151010] ring-1 ring-rose-900/18",
    actionHeading: "text-rose-200/88",
  },
  medium: {
    border: "border-amber-900/28 shadow-[0_0_14px_rgba(160,110,40,0.07)]",
    bar: "bg-amber-800/85 shadow-[0_0_6px_rgba(150,100,35,0.18)]",
    glow: "bg-gradient-to-br from-amber-950/32 via-[#100f0a] to-[#0c0c0c]",
    badge:
      "border-amber-700/35 bg-amber-950/25 text-amber-100/90 ring-1 ring-amber-800/14",
    badgeLabel: "Medium risk",
    actionShell: "border-amber-800/30 bg-amber-950/22 ring-1 ring-amber-900/12",
    actionHeading: "text-amber-100/88",
  },
  safe: {
    border: "border-teal-900/22 shadow-[0_0_12px_rgba(35,95,85,0.06)]",
    bar: "bg-teal-700/80 shadow-[0_0_6px_rgba(32,105,95,0.16)]",
    glow: "bg-gradient-to-br from-emerald-950/22 via-[#0a0f0d] to-[#0c0c0c]",
    badge:
      "border-teal-700/28 bg-emerald-950/22 text-teal-100/90 ring-1 ring-teal-800/12",
    badgeLabel: "Safe",
    actionShell: "border-teal-800/22 bg-emerald-950/16 ring-1 ring-teal-900/10",
    actionHeading: "text-teal-100/88",
  },
  idle: {
    border: "border-white/[0.1]",
    bar: "bg-white/20",
    glow: "bg-[#0c0c0c]",
    badge: "border-white/[0.12] bg-white/[0.06] text-[color:var(--text-soft)]",
    badgeLabel: "Idle",
    actionShell: "border-white/[0.1] bg-[#101010]",
    actionHeading: "text-[color:var(--text-soft)]",
  },
};

const DE_PRIMARY_BASE =
  "openmail-de-primary-action inline-flex w-auto max-w-fit shrink-0 items-center justify-center rounded-lg px-3 py-2 text-center text-[13px] font-semibold leading-tight tracking-tight shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[transform,filter,box-shadow] duration-150 ease-out hover:brightness-[1.04] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45";

const DE_PRIMARY_HIGH = `${DE_PRIMARY_BASE} openmail-de-primary--high border border-rose-800/28 bg-gradient-to-b from-rose-800 to-rose-900 text-rose-50 focus-visible:outline-rose-400/22`;

const DE_PRIMARY_MEDIUM = `${DE_PRIMARY_BASE} openmail-de-primary--medium border border-amber-800/28 bg-gradient-to-b from-amber-800/95 to-amber-950 text-amber-50 focus-visible:outline-amber-400/22`;

const DE_PRIMARY_SAFE = `${DE_PRIMARY_BASE} openmail-de-primary--safe border border-teal-800/22 bg-gradient-to-b from-teal-700 to-teal-800 text-teal-50 focus-visible:outline-teal-400/22`;

const DE_SECONDARY =
  "openmail-de-secondary-btn inline-flex w-auto max-w-fit shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-main)]/82 transition-colors hover:border-white/[0.18] hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/25 disabled:pointer-events-none disabled:opacity-40";

const DE_TERTIARY =
  "openmail-de-tertiary-link inline-flex w-auto max-w-fit text-left text-[10px] font-medium text-[color:var(--text-soft)] underline decoration-white/20 underline-offset-2 transition-colors hover:text-[var(--text-main)] hover:decoration-white/35 disabled:opacity-40";

/** Right-side vertical action column (paired with copy on the left). */
const DE_ACTIONS_COL = "openmail-de-actions-col flex shrink-0 flex-col items-end justify-start gap-1.5";

function CoreAiRiskCard({
  mail,
  intentBarLabel,
  intentBarTitle,
  transitionActive = false,
  onPrimaryAction,
  onBlockAndReport,
  onOpenSandbox,
  onQuickReply,
  onArchive,
  onMarkSafe,
  actionBusy = null,
  quickReplyBusy = false,
  safePrimaryLabel = "Quick reply",
  safeShowArchive = true,
}: {
  mail: ProcessedMail | null;
  /** Single-line intent / recommended action (thin bar under risk badge). */
  intentBarLabel?: string | null;
  intentBarTitle?: string | null;
  /** Brief collapse when transitioning from decision to reply. */
  transitionActive?: boolean;
  onPrimaryAction?: () => void;
  onBlockAndReport?: () => void | Promise<void>;
  onOpenSandbox?: () => void | Promise<void>;
  onQuickReply?: () => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
  onMarkSafe?: () => void | Promise<void>;
  actionBusy?: "block" | "phishing" | "sandbox" | "safe" | null;
  quickReplyBusy?: boolean;
  safePrimaryLabel?: string;
  /** Hide when the primary action already clears the thread (e.g. ignore). */
  safeShowArchive?: boolean;
}) {
  const { theme } = useOpenmailTheme();
  const isLight = theme === "soft-intelligence-light";
  const band = coreRiskBand(mail);
  const skin = CORE_RISK_CARD[band];
  const snapshot = coreRiskSnapshot(mail);
  const whyParagraph = coreWhyMattersParagraph(mail, band);
  const whyBullets = coreWhyMattersBullets(mail, whyParagraph);
  const decisionLine = decisionEngineHeadline(band);
  const detectionLines = useMemo(
    () => buildCoreDetectionReasons(mail).slice(0, 2),
    [mail]
  );
  const previewPlain = useMemo(() => coreMailPreviewPlain(mail), [mail]);
  const idleCopy =
    "Select a message — the Decision engine will flag risk and show one clear action.";

  /** Single-line priority: synced/security summary, else intent (intent bar removed from chrome). */
  const topSummary = useMemo(() => {
    const s = snapshot?.trim() ?? "";
    const intent = intentBarLabel?.trim() ?? "";
    if (s) return s;
    if (intent) return intent;
    return "";
  }, [snapshot, intentBarLabel]);

  const showIntentInDetails = useMemo(() => {
    const s = snapshot?.trim() ?? "";
    const intent = intentBarLabel?.trim() ?? "";
    return Boolean(intent) && Boolean(s) && intent !== s;
  }, [snapshot, intentBarLabel]);

  const hasExpandableDetails = useMemo(() => {
    const s = snapshot?.trim() ?? "";
    const extraSnapshot =
      s.length > 110 || (Boolean(s) && showIntentInDetails);
    return (
      previewPlain.length > 0 ||
      Boolean(whyParagraph?.trim()) ||
      whyBullets.length > 0 ||
      detectionLines.length > 0 ||
      extraSnapshot
    );
  }, [
    previewPlain.length,
    snapshot,
    whyParagraph,
    whyBullets.length,
    detectionLines.length,
    showIntentInDetails,
  ]);

  const snapshotFullInDetails = useMemo(() => {
    const t = snapshot?.trim() ?? "";
    if (!t) return false;
    if (t !== topSummary.trim()) return true;
    return t.length > 110;
  }, [snapshot, topSummary]);

  const [previewExpanded, setPreviewExpanded] = useState(false);
  useEffect(() => {
    setPreviewExpanded(false);
  }, [mail?.id]);

  const prevBandRef = useRef<CoreRiskBand | null>(null);
  const prevMailIdForPulseRef = useRef<string | null>(null);
  const [riskPulse, setRiskPulse] = useState(false);

  /** Pulse only when risk band changes for the same thread (e.g. analysis landed), not when switching messages. */
  useEffect(() => {
    if (!mail) {
      prevBandRef.current = null;
      prevMailIdForPulseRef.current = null;
      return;
    }
    const sameThread =
      prevMailIdForPulseRef.current != null &&
      prevMailIdForPulseRef.current === mail.id;
    const prev = prevBandRef.current;
    let t: number | undefined;
    if (sameThread && prev !== null && prev !== band) {
      setRiskPulse(true);
      t = window.setTimeout(() => setRiskPulse(false), 620);
    }
    prevBandRef.current = band;
    prevMailIdForPulseRef.current = mail.id;
    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [mail?.id, band, mail]);

  return (
    <div
      className={`core-ai-risk-shell core-ai-risk-card core-ai-risk-card--${band} relative shrink-0 overflow-hidden rounded-[12px] border transition-[border-color,box-shadow,transform,opacity] duration-300 ${skin.border} ${
        riskPulse ? "core-ai-risk-card--pulse" : ""
      } ${transitionActive ? "scale-[0.985] -translate-y-0.5 opacity-90" : "scale-100 opacity-100"}`}
    >
      <div className={`pointer-events-none absolute inset-0 ${skin.glow}`} aria-hidden />
      <div
        className={`absolute left-0 top-0 z-[1] h-full w-1 rounded-l-[11px] ${skin.bar}`}
        aria-hidden
      />
      <div className="relative z-[2] p-2.5 pl-3.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            Decision engine
          </span>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${skin.badge}`}
          >
            {skin.badgeLabel}
          </span>
        </div>

        {band === "idle" ? (
          <p className="text-[11px] leading-snug text-[color:var(--text-soft)]">{idleCopy}</p>
        ) : (
          <>
            {topSummary ? (
              <p
                className="mb-2 line-clamp-2 text-[11px] leading-snug text-[var(--text-main)]/88"
                title={intentBarTitle ?? topSummary}
              >
                {topSummary}
              </p>
            ) : null}

            <div
              className={`core-ai-risk-action-card flex min-w-0 flex-row items-start gap-3 rounded-[10px] border p-2.5 ${skin.actionShell}`}
            >
              <div className="min-w-0 flex-1 pr-0.5">
                <h3
                  className={`text-[9px] font-extrabold uppercase tracking-[0.16em] ${skin.actionHeading}`}
                >
                  What to do
                </h3>
                <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--text-main)]">
                  {decisionLine}
                </p>
              </div>

              {band === "high" ? (
                <div className={DE_ACTIONS_COL}>
                  <button
                    type="button"
                    className={DE_PRIMARY_HIGH}
                    onClick={() => {
                      onPrimaryAction?.();
                      void onBlockAndReport?.();
                    }}
                    disabled={!mail || !onBlockAndReport || actionBusy != null}
                  >
                    {actionBusy === "block" ? "Working…" : "Block & report"}
                  </button>
                  <button
                    type="button"
                    className={DE_SECONDARY}
                    onClick={() => void onOpenSandbox?.()}
                    disabled={!mail || !onOpenSandbox || actionBusy != null}
                  >
                    {actionBusy === "sandbox" ? "Opening…" : "Open in sandbox"}
                  </button>
                  {onMarkSafe ? (
                    <button
                      type="button"
                      className={DE_TERTIARY}
                      onClick={() => void onMarkSafe()}
                      disabled={!mail || actionBusy != null}
                    >
                      {actionBusy === "safe" ? "Applying…" : "Mark as safe"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {band === "medium" ? (
                <div className={DE_ACTIONS_COL}>
                  <button
                    type="button"
                    className={DE_PRIMARY_MEDIUM}
                    onClick={() => {
                      onPrimaryAction?.();
                      void onOpenSandbox?.();
                    }}
                    disabled={!mail || !onOpenSandbox || actionBusy != null}
                  >
                    {actionBusy === "sandbox" ? "Opening…" : "Open safely"}
                  </button>
                  <button
                    type="button"
                    className={DE_SECONDARY}
                    onClick={() => onArchive?.()}
                    disabled={!mail || !onArchive || actionBusy != null}
                  >
                    Ignore
                  </button>
                  {onMarkSafe ? (
                    <button
                      type="button"
                      className={DE_TERTIARY}
                      onClick={() => void onMarkSafe()}
                      disabled={!mail || actionBusy != null}
                    >
                      {actionBusy === "safe" ? "Applying…" : "Mark as safe"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {band === "safe" ? (
                <div className={DE_ACTIONS_COL}>
                  <button
                    type="button"
                    className={DE_PRIMARY_SAFE}
                    onClick={() => {
                      onPrimaryAction?.();
                      void onQuickReply?.();
                    }}
                    disabled={!mail || !onQuickReply || actionBusy != null || quickReplyBusy}
                  >
                    {quickReplyBusy ? "Working…" : safePrimaryLabel}
                  </button>
                  {safeShowArchive ? (
                    <button
                      type="button"
                      className={DE_SECONDARY}
                      onClick={() => onArchive?.()}
                      disabled={!mail || !onArchive || actionBusy != null || quickReplyBusy}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {hasExpandableDetails ? (
              <div className="mt-2 border-t border-white/[0.06] pt-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide text-[var(--accent)] transition-colors hover:bg-white/[0.06]"
                    onClick={() => setPreviewExpanded((v) => !v)}
                    aria-expanded={previewExpanded}
                  >
                    {previewExpanded ? "Hide details" : "AI details"}
                  </button>
                </div>
                {previewExpanded ? (
                  <div className="mt-2 space-y-2">
                    {showIntentInDetails && intentBarLabel ? (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Intent
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[var(--text-main)]">
                          {intentBarLabel}
                        </p>
                      </div>
                    ) : null}
                    {previewPlain ? (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Message preview
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-[var(--text-main)]/88">
                          {previewPlain}
                        </p>
                      </div>
                    ) : null}
                    {snapshot?.trim() &&
                    snapshotFullInDetails &&
                    (!previewPlain || !previewPlain.includes(snapshot.slice(0, 12))) ? (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Summary
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[var(--text-main)]/92">
                          {snapshot}
                        </p>
                      </div>
                    ) : null}
                    {whyParagraph ? (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Context
                        </div>
                        <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-main)]/85">{whyParagraph}</p>
                      </div>
                    ) : null}
                    {whyBullets.length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-3.5 text-[10px] leading-snug text-[color:var(--text-soft)]">
                        {whyBullets.slice(0, 4).map((b, i) => (
                          <li key={`${i}-${b.slice(0, 36)}`}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                    {detectionLines.length > 0 ? (
                      <div
                        className={`openmail-ai-signals-box rounded-[8px] border px-2 py-1.5 ${
                          isLight
                            ? "border-black/[0.08] bg-white/[0.88] shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-md"
                            : "border-white/[0.06] bg-black/25"
                        }`}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Signals
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-3 text-[10px] text-[var(--text-main)]/85 marker:text-[color:var(--text-soft)]">
                          {detectionLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function isListSearchField(el: Element | null): boolean {
  if (!el || el.tagName !== "INPUT") return false;
  if (el.getAttribute("data-openmail-list-search") != null) return true;
  const i = el as HTMLInputElement;
  if (i.type === "search") return true;
  const ph = (i.placeholder || "").toLowerCase();
  return ph.includes("search situation") || ph.includes("search mail");
}

export function AIPanel({
  selectedMail,
  readingMailId = null,
  actionLabel,
  onProceed,
  proceedBusy = false,
  onApplyTopSuggestion: _onApplyTopSuggestion,
  onCoreIgnore,
  onCoreEscalate,
  onCoreReplyWithSuggestion,
  onRiskBlockSender: _onRiskBlockSender,
  onRiskReportPhishing: _onRiskReportPhishing,
  onRiskOpenSandbox,
  onRiskMarkSafe,
  onDecisionBlockAndReport,
  onDecisionArchive,
  riskActionBusy = null,
  recommendedCoreAction = null,
  replyState,
  onReplyChange,
  onSelectSuggestion,
  replyTone,
  onToneChange,
  onSendReply,
  sending,
  sendError,
  sendSuccess,
  onGenerateAiReply,
  onGuardianAssistDraft,
  aiReplyLoading = false,
  guardianDraftLoading = false,
  guardianAutoResponseMode = "require_validation",
  guardianAutoResponseEnabled = false,
}: AIPanelProps) {
  void _onRiskBlockSender;
  void _onRiskReportPhishing;
  void _onApplyTopSuggestion;
  void onCoreIgnore;
  void onCoreEscalate;
  void onCoreReplyWithSuggestion;
  const { ai: aiPrefs } = useOpenmailPreferences();
  const { theme } = useOpenmailTheme();
  const isLightTheme = theme === "soft-intelligence-light";
  const [insertAnim, setInsertAnim] = useState(false);
  const [suggestionGlow, setSuggestionGlow] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [suggestionNavigateNonce, setSuggestionNavigateNonce] = useState(0);
  const [prefillSurfaceAnim, setPrefillSurfaceAnim] = useState(false);
  const [acceptedSuggestionIndex, setAcceptedSuggestionIndex] = useState<number | null>(null);
  const [decisionToReplyCue, setDecisionToReplyCue] = useState(false);
  const [highRiskSendAck, setHighRiskSendAck] = useState(false);
  const glowClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decisionToReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionPreviewBaseRef = useRef<string | null>(null);
  const suggestionPreviewIndexRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedMailIdRef = useRef<string | null>(null);
  selectedMailIdRef.current = selectedMail?.id ?? null;

  useEffect(() => {
    setUserTyping(false);
    setHighRiskSendAck(false);
    suggestionPreviewBaseRef.current = null;
    suggestionPreviewIndexRef.current = null;
  }, [selectedMail?.id]);

  useEffect(() => {
    if (!selectedMail?.id) return;
    if (readingMailId && readingMailId === selectedMail.id) return;
    setPrefillSurfaceAnim(true);
    const t = window.setTimeout(() => setPrefillSurfaceAnim(false), 260);
    return () => window.clearTimeout(t);
  }, [selectedMail?.id, readingMailId]);

  /** Soft focus reply after selection — delayed, no scroll, skipped in list search / reading overlay. */
  useEffect(() => {
    const mailId = selectedMailIdRef.current;
    if (!mailId) return;
    if (readingMailId && readingMailId === mailId) return;
    const t = window.setTimeout(() => {
      if (selectedMailIdRef.current !== mailId) return;
      const active = document.activeElement;
      if (isListSearchField(active)) return;
      if (
        active &&
        active !== textareaRef.current &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")
      ) {
        return;
      }
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      try {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [selectedMail?.id, readingMailId]);

  useEffect(() => {
    return () => {
      if (glowClearRef.current) clearTimeout(glowClearRef.current);
      if (acceptClearRef.current) clearTimeout(acceptClearRef.current);
      if (decisionToReplyTimerRef.current) clearTimeout(decisionToReplyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setDecisionToReplyCue(false);
    if (decisionToReplyTimerRef.current) {
      clearTimeout(decisionToReplyTimerRef.current);
      decisionToReplyTimerRef.current = null;
    }
  }, [selectedMail?.id]);

  const triggerDecisionToReplyCue = useCallback(() => {
    setDecisionToReplyCue(true);
    if (decisionToReplyTimerRef.current) clearTimeout(decisionToReplyTimerRef.current);
    decisionToReplyTimerRef.current = setTimeout(() => {
      setDecisionToReplyCue(false);
      decisionToReplyTimerRef.current = null;
    }, 460);
  }, []);

  const flashSuggestionAccepted = useCallback((index: number) => {
    if (acceptClearRef.current) clearTimeout(acceptClearRef.current);
    setAcceptedSuggestionIndex(index);
    acceptClearRef.current = setTimeout(() => {
      setAcceptedSuggestionIndex(null);
      acceptClearRef.current = null;
    }, 520);
  }, []);

  useLayoutEffect(() => {
    if (suggestionNavigateNonce === 0) return;
    const el = textareaRef.current;
    if (!el) return;
    const smoothScroll =
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: smoothScroll ? "smooth" : "auto",
      block: "center",
      inline: "nearest",
    });
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore invalid selection in edge cases */
      }
    });
  }, [suggestionNavigateNonce]);

  const draftTrimmed = replyState.currentReply.trim();
  const hasPreloadedDraft =
    !!selectedMail && replyState.suggestions.length > 0 && draftTrimmed.length > 0;

  const replyAssist = useMemo(
    () =>
      getReplyAssistUiState(selectedMail, recommendedCoreAction ?? null, draftTrimmed, {
        hasOpenmailAutoReplyDraft: !!selectedMail?.openmailAutoReplyDraft?.trim(),
      }),
    [selectedMail, recommendedCoreAction, draftTrimmed]
  );

  const decisionEngineBand = useMemo(
    () => coreRiskBand(selectedMail),
    [selectedMail]
  );
  const highRiskUiLock = decisionEngineBand === "high";
  /** High-risk threads need an explicit ack before Send / composer actions (zero-tolerance). */
  const coreSendBlocked =
    guardianAutoResponseMode === "block" &&
    !(highRiskUiLock && highRiskSendAck);

  const hasRecommendedAction = recommendedCoreAction != null;

  const handleSuggestionClick = useCallback(
    (index: number) => {
      suggestionPreviewBaseRef.current = null;
      suggestionPreviewIndexRef.current = null;
      onSelectSuggestion(index);
      setSuggestionNavigateNonce((n) => n + 1);
      flashSuggestionAccepted(index);
      setInsertAnim(true);
      window.setTimeout(() => setInsertAnim(false), 280);
      if (glowClearRef.current) clearTimeout(glowClearRef.current);
      setSuggestionGlow(true);
      glowClearRef.current = setTimeout(() => {
        setSuggestionGlow(false);
        glowClearRef.current = null;
      }, 520);
    },
    [flashSuggestionAccepted, onSelectSuggestion]
  );

  const handleSuggestionHoverStart = useCallback(
    (index: number) => {
      if (aiReplyLoading || guardianDraftLoading) return;
      const suggestion = replyState.suggestions[index] ?? "";
      if (!suggestion || index === replyState.selectedIndex) return;
      if (suggestionPreviewBaseRef.current == null) {
        suggestionPreviewBaseRef.current = replyState.currentReply;
      }
      suggestionPreviewIndexRef.current = index;
      onReplyChange(suggestion);
    },
    [
      aiReplyLoading,
      guardianDraftLoading,
      onReplyChange,
      replyState.currentReply,
      replyState.selectedIndex,
      replyState.suggestions,
    ]
  );

  const handleSuggestionHoverEnd = useCallback(() => {
    const base = suggestionPreviewBaseRef.current;
    const idx = suggestionPreviewIndexRef.current;
    suggestionPreviewBaseRef.current = null;
    suggestionPreviewIndexRef.current = null;
    if (idx == null || base == null) return;
    onReplyChange(base);
  }, [onReplyChange]);

  const handleProceedClick = useCallback(async () => {
    await onProceed();
    const r = recommendedCoreAction;
    if (coreSendBlocked && r !== "ignore" && r !== "escalate") {
      return;
    }
    if (
      r === "reply" ||
      r === "schedule" ||
      r === "review"
    ) {
      setSuggestionNavigateNonce((n) => n + 1);
      flashSuggestionAccepted(0);
      setInsertAnim(true);
      window.setTimeout(() => setInsertAnim(false), 280);
      if (glowClearRef.current) clearTimeout(glowClearRef.current);
      setSuggestionGlow(true);
      glowClearRef.current = setTimeout(() => {
        setSuggestionGlow(false);
        glowClearRef.current = null;
      }, 520);
    }
  }, [
    flashSuggestionAccepted,
    onProceed,
    recommendedCoreAction,
    coreSendBlocked,
  ]);

  const guardianBlocksCoreSend = coreSendBlocked;
  const hideLegacyProceedButton =
    aiPrefs.autoAnalyze && selectedMail && decisionEngineBand === "safe";

  const safeEnginePrimaryLabel =
    recommendedCoreAction === "ignore"
      ? "Archive"
      : recommendedCoreAction === "escalate"
        ? "Flag for follow-up"
        : "Quick reply";
  const safeEngineShowArchive = recommendedCoreAction !== "ignore";

  const intentBarLine = useMemo(() => {
    if (!selectedMail) return { label: null as string | null, title: null as string | null };
    const u = selectedMail.syncedAi?.intentUrgency;
    const urgFrag =
      u === "high" ? "High urgency" : u === "medium" ? "Medium urgency" : null;
    const label = urgFrag ? `${actionLabel} · ${urgFrag}` : actionLabel;
    const reason = selectedMail.syncedAi?.reason?.trim();
    const title = [label, reason].filter(Boolean).join(" — ");
    return { label, title: title || label };
  }, [selectedMail, actionLabel]);

  return (
    <aside className="openmail-ai-panel card flex min-h-0 min-w-0 flex-[0.65] flex-col overflow-hidden border border-white/[0.07] bg-[color:var(--openmail-ai-chrome)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_36px_var(--openmail-shadow-accent-xs)] sm:p-6 sm:pt-7">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <h2 className="mb-4 shrink-0 text-base font-semibold tracking-tight text-[color:var(--text-main)] sm:text-lg">
          Decision engine
        </h2>

        <div
          key={selectedMail?.id ?? "__idle__"}
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden${
            selectedMail ? " fade-in" : ""
          }`}
        >
          {aiPrefs.autoAnalyze ? (
            <CoreAiRiskCard
              mail={selectedMail}
              intentBarLabel={selectedMail ? intentBarLine.label : null}
              intentBarTitle={selectedMail ? intentBarLine.title : null}
              transitionActive={decisionToReplyCue}
              onPrimaryAction={triggerDecisionToReplyCue}
              onBlockAndReport={onDecisionBlockAndReport}
              onOpenSandbox={onRiskOpenSandbox}
              onQuickReply={() => void handleProceedClick()}
              onArchive={onDecisionArchive}
              onMarkSafe={onRiskMarkSafe}
              actionBusy={riskActionBusy}
              quickReplyBusy={
                proceedBusy ||
                sending ||
                guardianBlocksCoreSend ||
                aiReplyLoading ||
                guardianDraftLoading
              }
              safePrimaryLabel={safeEnginePrimaryLabel}
              safeShowArchive={safeEngineShowArchive}
            />
          ) : null}

          <div className="openmail-ai-reply-stack mt-6 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[var(--border)] pt-7">
            {selectedMail && highRiskUiLock ? (
              <div
                className="mb-4 rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2.5 text-[12px] font-semibold leading-snug text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.12)]"
                role="status"
              >
                ⚠️ High risk message — likely scam or manipulation attempt
              </div>
            ) : null}
            <div
              className={`openmail-ai-reply-pane flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border p-4 transition-[box-shadow,background-color,border-color,transform] duration-200 ease-out sm:p-5 ${
                decisionToReplyCue
                  ? "border-[var(--accent)]/25 bg-[var(--accent-soft)]/12 shadow-[0_0_20px_var(--openmail-shadow-accent-sm)]"
                  : "border-[var(--border)] bg-[color:var(--openmail-list-inner)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              }`}
            >
              {!selectedMail ? (
                <p className="text-[13px] leading-snug text-[color:var(--text-soft)]">Select a message.</p>
              ) : (
                <>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-7 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                    <div className="openmail-ai-reply-zone flex min-h-0 shrink-0 flex-col gap-3">
                      <div>
                        <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-[color:var(--text-main)]">
                          AI Insight
                        </h3>
                        <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--text-soft)]">
                          Generated based on risk, intent, and context
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {TONES.map((tone) => (
                          <button
                            key={tone}
                            type="button"
                            className={`openmail-reply-tone-chip rounded-full border px-3 py-1 text-[11px] font-medium transition-[background-color,border-color,box-shadow,color] duration-150 ease-out ${
                              replyTone === tone
                                ? "openmail-reply-tone-chip--selected border-[var(--accent)]/50 bg-[var(--accent-soft)]/35 text-[color:var(--text-main)]"
                                : "openmail-reply-tone-chip--idle border-[var(--border)] bg-transparent text-[color:var(--text-soft)] hover:border-[var(--accent)]/35 hover:bg-white/[0.04]"
                            }`}
                            onClick={() => onToneChange(tone)}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                      <div
                        className={`rounded-[12px] border ${
                          coreSendBlocked
                            ? "border-red-500/35 bg-red-950/20 px-3.5 py-3"
                            : guardianAutoResponseMode === "require_validation" ||
                                guardianAutoResponseMode === "block"
                              ? "border-[rgba(255,180,0,0.2)] bg-[rgba(255,180,0,0.08)] px-4 py-3.5"
                              : "border-emerald-500/30 bg-emerald-950/15 px-3.5 py-3"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {guardianAutoResponseMode === "auto_send" ? (
                            <span className="rounded-md border border-emerald-400/45 bg-emerald-600/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100">
                              Guardian Approved
                            </span>
                          ) : null}
                          <span
                            className={`min-w-0 flex-1 font-medium leading-[1.45] ${
                              guardianAutoResponseMode === "require_validation" ||
                              guardianAutoResponseMode === "block"
                                ? "text-[11px] text-[color:var(--text-main)] opacity-[0.9]"
                                : "text-[10px] leading-snug text-[color:var(--text-soft)]"
                            }`}
                          >
                            {guardianAutoResponseDescription(guardianAutoResponseMode)}
                          </span>
                        </div>
                        {guardianAutoResponseMode === "auto_send" && guardianAutoResponseEnabled ? (
                          <p className="mt-1.5 text-[10px] leading-snug text-emerald-200/90">
                            When enabled, Guardian sends the top draft without tapping Send—only on threads it has approved.
                          </p>
                        ) : guardianAutoResponseMode === "auto_send" && !guardianAutoResponseEnabled ? (
                          <p className="mt-1.5 text-[10px] leading-snug text-[color:var(--text-soft)]">
                            Enable Guardian auto-response in Settings to allow automatic send on approved threads.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {aiPrefs.autoSuggestions && replyState.suggestions.length > 0 ? (
                      <div
                        key={`core-suggestions-${selectedMail.id}`}
                        className={`openmail-ai-reply-zone core-suggestions-enter core-suggestion-chip-list flex max-h-[min(200px,28vh)] flex-col gap-2 overflow-y-auto pr-0.5 transition-opacity duration-200 ease-out ${
                          isLightTheme ? "openmail-ai-suggestions-glass" : ""
                        } ${userTyping ? "opacity-70" : "opacity-100"}`}
                      >
                        {replyState.suggestions.map((suggestion, index) => {
                          const isBest = index === 0;
                          const selected = replyState.selectedIndex === index;
                          const accepted = acceptedSuggestionIndex === index;
                          return (
                            <button
                              key={`${index}-${suggestion.slice(0, 24)}`}
                              type="button"
                              disabled={
                                aiReplyLoading ||
                                guardianDraftLoading ||
                                coreSendBlocked
                              }
                              aria-current={isBest ? "true" : undefined}
                              aria-label={isBest ? `Best suggestion: ${suggestion}` : undefined}
                              title="Hover to preview. Click to insert into your draft (not sent until you tap Send)."
                              className={`core-suggestion-chip w-full rounded-[12px] border px-3 py-2 text-left text-[13px] leading-snug transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-45 ${
                                isBest
                                  ? "core-suggestion-chip--best-pick border-[color:var(--openmail-border-accent-strong)]/55 bg-[var(--accent-soft)]/15 font-medium text-[color:var(--text-main)] shadow-[0_0_14px_var(--openmail-shadow-accent-xs)]"
                                  : selected
                                    ? "core-suggestion-chip--selected border-[var(--accent)]/40 bg-white/[0.05] text-[color:var(--text-main)]"
                                    : "core-suggestion-chip--idle border-[var(--border)] bg-transparent text-[color:var(--text-main)]/92 hover:border-[var(--accent)]/28 hover:bg-white/[0.04] hover:shadow-[0_0_12px_var(--openmail-shadow-accent-xs)]"
                              } ${accepted ? "core-suggestion-chip--accepted" : ""}`}
                              onMouseEnter={() => handleSuggestionHoverStart(index)}
                              onMouseLeave={handleSuggestionHoverEnd}
                              onFocus={() => handleSuggestionHoverStart(index)}
                              onBlur={handleSuggestionHoverEnd}
                              onClick={() => handleSuggestionClick(index)}
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="min-w-0 flex-1">{suggestion}</span>
                                {isBest ? (
                                  <span className="shrink-0 rounded-full border border-[var(--accent)]/45 bg-[var(--accent-soft)]/35 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                                    Recommended
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {onGenerateAiReply || onGuardianAssistDraft ? (
                      <div className="openmail-ai-reply-zone flex shrink-0 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {onGenerateAiReply ? (
                            <button
                              type="button"
                              disabled={
                                !selectedMail ||
                                aiReplyLoading ||
                                guardianDraftLoading ||
                                sending ||
                                proceedBusy ||
                                coreSendBlocked
                              }
                              title="Friendly, professional drafts to help you write faster"
                              onClick={() => void onGenerateAiReply()}
                              className={
                                isLightTheme
                                  ? "rounded-[10px] border border-emerald-600/22 bg-gradient-to-b from-[#4ade80] to-[#22c55e] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(22,163,74,0.22)] transition-[filter,box-shadow] hover:brightness-[1.03] hover:shadow-[0_2px_8px_rgba(22,163,74,0.2)] disabled:cursor-not-allowed disabled:opacity-45"
                                  : "rounded-[10px] border border-[var(--border)] bg-transparent px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text-soft)] transition-colors hover:border-[var(--accent)]/30 hover:bg-white/[0.04] hover:text-[color:var(--text-main)] disabled:cursor-not-allowed disabled:opacity-45"
                              }
                            >
                              {aiReplyLoading ? "Writing…" : "Generate AI reply"}
                            </button>
                          ) : null}
                          {onGuardianAssistDraft ? (
                            <button
                              type="button"
                              disabled={
                                !selectedMail ||
                                aiReplyLoading ||
                                guardianDraftLoading ||
                                sending ||
                                proceedBusy ||
                                coreSendBlocked
                              }
                              title={
                                coreSendBlocked
                                  ? guardianAutoResponseDescription("block")
                                  : "Defensive wording: verify identity, refuse risky asks — does not send"
                              }
                              onClick={() => void onGuardianAssistDraft()}
                              className={
                                isLightTheme
                                  ? "rounded-[10px] border border-black/[0.1] bg-[#f3f4f6] px-3 py-1.5 text-[11px] font-semibold text-[#374151] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[background-color,border-color,box-shadow] hover:border-black/[0.14] hover:bg-[#e5e7eb] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-45"
                                  : "rounded-[10px] border border-[var(--border)] bg-transparent px-3 py-1.5 text-[11px] font-semibold text-[color:var(--text-soft)] transition-colors hover:border-[var(--accent)]/30 hover:bg-white/[0.04] hover:text-[color:var(--text-main)] disabled:cursor-not-allowed disabled:opacity-45"
                              }
                            >
                              {guardianDraftLoading
                                ? "Securing draft…"
                                : "Safe reply (Guardian)"}
                            </button>
                          ) : null}
                        </div>
                        <p className="text-[10px] leading-snug text-[color:var(--text-soft)]">
                          <span className="text-[color:var(--text-main)]/90">AI reply</span> helps you
                          write.{" "}
                          <span className="text-[color:var(--text-main)]/90">Safe reply</span>{" "}
                          (Guardian) protects you from risky or misleading requests. Neither sends
                          automatically.
                        </p>
                      </div>
                    ) : null}
                    {replyState.suggestions.length > 0 &&
                    replyState.selectedIndex < 0 &&
                    !draftTrimmed ? (
                      <p className="text-[10px] leading-snug text-[color:var(--text-soft)]">
                        Recommended text appears in the chips above — click one to insert it, or write freely below. Nothing is sent until you tap Send.
                      </p>
                    ) : null}
                    {!hideLegacyProceedButton ? (
                      <button
                        key={`core-proceed-${selectedMail.id}`}
                        type="button"
                        className={`w-full shrink-0 rounded-[10px] border px-3 py-2 text-[11px] font-semibold transition-colors duration-150 ease-out ${
                          hasRecommendedAction
                            ? "border-[var(--accent)]/45 bg-[var(--accent-soft)]/25 text-[color:var(--text-main)] hover:brightness-105"
                            : "border-[var(--border)] bg-transparent text-[color:var(--text-soft)] hover:border-[var(--accent)]/30 hover:bg-white/[0.04] hover:text-[color:var(--text-main)]"
                        } ${hasPreloadedDraft ? "core-primary-draft--subtle-ready" : ""} disabled:cursor-not-allowed disabled:opacity-45`}
                        onClick={() => void handleProceedClick()}
                        disabled={
                          !selectedMail ||
                          proceedBusy ||
                          sending ||
                          aiReplyLoading ||
                          guardianDraftLoading ||
                          coreSendBlocked
                        }
                      >
                        {proceedBusy || sending ? "Working…" : CORE_ONE_TAP_CTA}
                      </button>
                    ) : null}
                    <div
                      className={`openmail-ai-reply-zone min-h-0 shrink-0 rounded-[12px] ${userTyping ? "ring-1 ring-[var(--openmail-focus-ring)]/40" : ""} ${insertAnim || prefillSurfaceAnim ? "core-reply-insert-anim" : ""}`}
                    >
                    <textarea
                      ref={textareaRef}
                      id="core-reply-textarea"
                      aria-label="Reply draft"
                      className={`core-reply-decision-surface !bg-[color:var(--openmail-input-bg)] min-h-[min(148px,26vh)] max-h-[min(45vh,28rem)] w-full resize-none overflow-y-auto rounded-[12px] border px-6 py-6 text-[15px] leading-[1.56] text-[color:var(--text-main)]/90 outline-none transition-[border-color,box-shadow,background] duration-200 ease-out placeholder:text-[color:var(--text-soft)] placeholder:opacity-75 focus:border-[color:var(--openmail-focus-border)] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_var(--openmail-focus-ring),0_0_20px_var(--openmail-focus-glow)] ${
                        replyAssist.readyToSend
                          ? "border-emerald-500/35 !bg-[#141a16]/95 shadow-[inset_0_0_24px_rgba(16,185,129,0.08)]"
                          : "border-[var(--border)]"
                      } ${suggestionGlow ? "core-reply-textarea--suggestion-glow" : ""} ${
                        replyAssist.suggestImmediateSend
                          ? theme === "soft-dark" || theme === "soft-intelligence-light"
                            ? "motion-safe:animate-[core-reply-ready-pulse-soft_2.4s_ease-in-out_infinite]"
                            : "motion-safe:animate-[core-reply-ready-pulse_2.4s_ease-in-out_infinite]"
                          : ""
                      }`}
                      value={replyState.currentReply}
                      onChange={(event) => {
                        setUserTyping(true);
                        onReplyChange(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        if (!event.metaKey && !event.ctrlKey) return;
                        event.preventDefault();
                        if (
                          !selectedMail ||
                          sending ||
                          proceedBusy ||
                          aiReplyLoading ||
                          guardianDraftLoading ||
                          !draftTrimmed ||
                          coreSendBlocked
                        ) {
                          return;
                        }
                        onSendReply();
                      }}
                      placeholder={
                        replyAssist.replyLike
                          ? "Edit or tap a suggestion…"
                          : "Your reply… (Ctrl+Enter or ⌘+Enter to send)"
                      }
                      spellCheck
                    />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="openmail-ai-footer sticky bottom-0 z-10 mt-4 shrink-0 border-t border-[var(--border)] bg-[color:var(--openmail-ai-chrome)] pt-4 backdrop-blur-[2px]">
              {selectedMail && highRiskUiLock ? (
                <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-red-500/35 bg-red-950/25 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-red-400/60 text-red-600 focus:ring-red-500/40"
                    checked={highRiskSendAck}
                    onChange={(e) => setHighRiskSendAck(e.target.checked)}
                  />
                  <span className="text-[11px] font-medium leading-snug text-[color:var(--text-main)]">
                    I understand this message may be fraudulent or manipulative. I still want to
                    compose or send a reply.
                  </span>
                </label>
              ) : null}
              {sendError ? (
                <div className="mb-2 text-center text-xs leading-snug text-red-300">{sendError}</div>
              ) : sendSuccess ? (
                <div className="mb-2 text-center text-xs leading-snug text-emerald-300/95">
                  {sendSuccess}
                </div>
              ) : null}
              <button
                type="button"
                className={`openmail-send-reply-btn w-full rounded-[11px] px-3 py-2.5 text-[13px] font-semibold transition-[background-color,border-color,box-shadow,color,filter] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-45 ${
                  replyAssist.suggestImmediateSend
                    ? "openmail-send-reply-btn--ready border border-emerald-400/40 bg-emerald-950/40 text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.2)] hover:border-emerald-400/55 hover:bg-emerald-900/35"
                    : "openmail-send-reply-btn--emphasis border border-[var(--border)] bg-white/[0.05] text-[color:var(--text-soft)] hover:border-[var(--accent)]/25 hover:bg-white/[0.08] hover:text-[color:var(--text-main)]"
                }`}
                onClick={onSendReply}
                disabled={
                  sending ||
                  proceedBusy ||
                  aiReplyLoading ||
                  guardianDraftLoading ||
                  !draftTrimmed ||
                  !selectedMail ||
                  coreSendBlocked
                }
              >
                {sending ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
