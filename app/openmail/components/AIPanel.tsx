"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProcessedMail } from "@/lib/mailTypes";
import { useOpenmailPreferences } from "../OpenmailPreferencesProvider";
import type { ReplyState, ReplyTone } from "./types";

type AIPanelProps = {
  selectedMail: ProcessedMail | null;
  actionLabel: string;
  coreSummary: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  replyState: ReplyState;
  onReplyChange: (text: string) => void;
  onSelectSuggestion: (index: number) => void;
  replyTone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  onSendReply: () => void;
  sending: boolean;
  sendError: string | null;
  sendSuccess: string | null;
};

const TONES: ReplyTone[] = ["Professional", "Friendly", "Direct", "Short"];

type CoreRiskBand = "high" | "medium" | "safe" | "idle";

function coreRiskBand(mail: ProcessedMail | null): CoreRiskBand {
  if (!mail) return "idle";
  if (mail.securityLevel === "high_risk") return "high";
  if (mail.securityLevel === "suspicious") return "medium";
  return "safe";
}

function coreRiskExplanation(mail: ProcessedMail | null): string {
  if (!mail) return "AI is standing by — pick a message to analyze signals in real time.";
  const sub = mail.securityAiSubline?.trim();
  const reason = mail.securityReason?.trim();
  if (sub) return sub;
  if (reason) return reason;
  return "No elevated risk patterns detected for this thread.";
}

function coreRiskRecommended(
  mail: ProcessedMail | null,
  band: CoreRiskBand,
  primaryActionLabel: string
): string {
  if (!mail) return "Open a thread to get tailored handling guidance.";
  const b = mail.securityWhyBullets;
  if (band === "high") {
    return b[0] ?? "Do not use links or attachments — escalate or delete this thread.";
  }
  if (band === "medium") {
    return b[0] ?? "Verify sender identity before sharing data; prefer sandboxed previews.";
  }
  return (
    b[0] ??
    `Safe to proceed with CORE — use "${primaryActionLabel}" when you are ready.`
  );
}

const CORE_RISK_CARD: Record<
  CoreRiskBand,
  { border: string; badge: string; badgeLabel: string }
> = {
  high: {
    border: "border-red-500/35 shadow-[0_0_20px_rgba(239,68,68,0.08)]",
    badge: "border-red-400/35 bg-red-500/[0.14] text-red-100/95",
    badgeLabel: "High",
  },
  medium: {
    border: "border-amber-500/35 shadow-[0_0_18px_rgba(245,158,11,0.07)]",
    badge: "border-amber-400/35 bg-amber-500/[0.12] text-amber-100/95",
    badgeLabel: "Medium",
  },
  safe: {
    border: "border-emerald-500/30 shadow-[0_0_16px_rgba(52,211,153,0.06)]",
    badge: "border-emerald-400/30 bg-emerald-500/[0.11] text-emerald-100/95",
    badgeLabel: "Safe",
  },
  idle: {
    border: "border-white/[0.08]",
    badge: "border-white/[0.1] bg-white/[0.05] text-[color:var(--text-soft)]",
    badgeLabel: "Idle",
  },
};

function CoreAiRiskCard({
  mail,
  primaryActionLabel,
}: {
  mail: ProcessedMail | null;
  primaryActionLabel: string;
}) {
  const band = coreRiskBand(mail);
  const skin = CORE_RISK_CARD[band];
  const explanation = coreRiskExplanation(mail);
  const recommended = coreRiskRecommended(mail, band, primaryActionLabel);

  return (
    <div
      className={`mb-4 shrink-0 rounded-[12px] border bg-[#0c0c0c]/95 p-3 transition-[border-color,box-shadow] duration-200 ${skin.border}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
          AI Risk Analysis
        </span>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${skin.badge}`}
        >
          {skin.badgeLabel}
        </span>
      </div>
      <p
        className="line-clamp-1 text-[12px] leading-snug text-[color:var(--text-main)]/88"
        title={explanation}
      >
        {explanation}
      </p>
      <div className="mt-2.5 border-t border-white/[0.05] pt-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          Recommended
        </span>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-main)]/90">{recommended}</p>
      </div>
    </div>
  );
}

export function AIPanel({
  selectedMail,
  actionLabel,
  coreSummary,
  primaryActionLabel,
  onPrimaryAction,
  replyState,
  onReplyChange,
  onSelectSuggestion,
  replyTone,
  onToneChange,
  onSendReply,
  sending,
  sendError,
  sendSuccess,
}: AIPanelProps) {
  const { ai: aiPrefs } = useOpenmailPreferences();
  const [insertAnim, setInsertAnim] = useState(false);
  const [suggestionGlow, setSuggestionGlow] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [suggestionNavigateNonce, setSuggestionNavigateNonce] = useState(0);
  const glowClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUserTyping(false);
  }, [selectedMail?.id]);

  useEffect(() => {
    return () => {
      if (glowClearRef.current) clearTimeout(glowClearRef.current);
    };
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

  const handleSuggestionClick = useCallback(
    (index: number) => {
      onSelectSuggestion(index);
      setSuggestionNavigateNonce((n) => n + 1);
      setInsertAnim(true);
      window.setTimeout(() => setInsertAnim(false), 230);
      if (glowClearRef.current) clearTimeout(glowClearRef.current);
      setSuggestionGlow(true);
      glowClearRef.current = setTimeout(() => {
        setSuggestionGlow(false);
        glowClearRef.current = null;
      }, 400);
    },
    [onSelectSuggestion]
  );

  return (
    <aside className="card flex min-h-0 min-w-0 flex-[0.65] flex-col overflow-hidden border-2 border-[var(--openmail-border-accent-strong)] bg-[#1a1a1a] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_var(--openmail-panel-inset),0_0_40px_var(--openmail-shadow-accent-xs)]">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <h2 className="mb-3 shrink-0 text-lg font-semibold tracking-tight">CORE</h2>

        <div className="mb-4 flex shrink-0 flex-col gap-2">
          <span className="inline-flex w-fit rounded-[8px] border border-[var(--border)] bg-[var(--bg-main)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            {actionLabel}
          </span>
          <p className="text-sm font-medium leading-snug text-[var(--text-main)]">{coreSummary}</p>
        </div>

        <div className="card mb-4 shrink-0 bg-[#141414] p-4">
          {selectedMail ? (
            <>
              <div className="text-sm font-semibold">{selectedMail.subject}</div>
              <div className="mt-1 text-xs text-[color:var(--text-soft)]">
                From: {selectedMail.sender || selectedMail.title}
              </div>
              <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[color:var(--text-soft)]">
                {selectedMail.content}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">No messages in this folder</div>
              <div className="mt-1 text-xs text-[color:var(--text-soft)]">From: —</div>
              <div className="mt-2 text-sm leading-relaxed text-[color:var(--text-soft)]">
                Switch folders or sync when you are ready — CORE stays primed.
              </div>
            </>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-[var(--border)] pt-4">
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 overflow-hidden">
            {/* Assistive column — dimmer */}
            <div className="flex min-h-0 min-w-0 flex-col border-r border-white/[0.06] bg-[#121212]/90 pr-4">
              <div className="min-h-0 flex flex-1 flex-col overflow-y-auto pl-1">
                {aiPrefs.autoAnalyze ? (
                  <CoreAiRiskCard
                    mail={selectedMail}
                    primaryActionLabel={primaryActionLabel}
                  />
                ) : null}

                {aiPrefs.autoSuggestions ? (
                  <h3 className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                    AI Suggestions
                  </h3>
                ) : null}

                <div className="mb-4 shrink-0">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-soft)]/80">
                    Tone
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        className={`rounded-[8px] border px-2 py-1 text-[10px] ${
                          replyTone === tone
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-main)]"
                            : "border-[var(--border)] bg-[#0f0f0f] text-[color:var(--text-soft)] hover:border-[var(--accent)]/60"
                        }`}
                        onClick={() => onToneChange(tone)}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                {aiPrefs.autoSuggestions ? (
                  <div
                    className={`flex min-h-0 flex-1 flex-col gap-2 transition-opacity duration-200 ease-out ${
                      userTyping ? "opacity-60" : "opacity-100"
                    }`}
                  >
                    {replyState.suggestions.map((suggestion, index) => (
                      <button
                        key={`${index}-${suggestion.slice(0, 18)}`}
                        type="button"
                        className={`shrink-0 rounded-[var(--radius)] border px-3 py-2.5 text-left text-xs leading-snug transition-all duration-200 ease-out will-change-transform ${
                          replyState.selectedIndex === index
                            ? "border-[var(--accent)]/80 bg-[#181818] text-[var(--text-main)] shadow-[0_0_12px_var(--accent-soft)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_var(--openmail-shadow-accent-sm)]"
                            : "border-white/[0.05] bg-[#0f0f0f] text-[color:var(--text-soft)] hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:bg-[#141414] hover:shadow-[0_6px_20px_var(--openmail-shadow-accent-sm)]"
                        }`}
                        onClick={() => handleSuggestionClick(index)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-4 w-full shrink-0 rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[#0f0f0f] px-3 py-2 text-xs font-medium text-[color:var(--text-soft)] transition-colors duration-150 hover:border-[color:color-mix(in_srgb,var(--accent)_32%,transparent)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]"
                  onClick={onPrimaryAction}
                >
                  {primaryActionLabel}
                </button>
              </div>
            </div>

            {/* Primary column — focus zone */}
            <div
              className={`flex min-h-0 min-w-0 flex-col bg-[#1e1e1e] pl-5 transition-[box-shadow] duration-200 ease-out ${
                userTyping
                  ? "shadow-[inset_0_0_0_1px_var(--openmail-focus-ring)]"
                  : "shadow-none"
              }`}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pr-1 pt-0.5">
                <label
                  htmlFor="core-reply-textarea"
                  className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-main)]"
                >
                  Your Reply — Edit then Send
                </label>
                <div
                  className={`min-h-0 flex-1 rounded-[14px] ${insertAnim ? "core-reply-insert-anim" : ""}`}
                >
                  <textarea
                    ref={textareaRef}
                    id="core-reply-textarea"
                    className={`core-reply-decision-surface min-h-[min(280px,40vh)] h-full w-full resize-none rounded-[14px] border border-white/[0.12] px-6 py-7 text-[16px] leading-[1.72] text-[var(--text-main)] outline-none transition-[border-color,box-shadow,background] duration-200 ease-out placeholder:text-[color:var(--text-soft)] placeholder:opacity-80 focus:border-[color:var(--openmail-focus-border)] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_20px_rgba(255,255,255,0.03),inset_0_0_0_1px_var(--openmail-focus-ring),0_0_0_3px_var(--openmail-focus-glow)] ${
                      suggestionGlow ? "core-reply-textarea--suggestion-glow" : ""
                    }`}
                    value={replyState.currentReply}
                    onChange={(event) => {
                      setUserTyping(true);
                      onReplyChange(event.target.value);
                    }}
                    placeholder="Edit your reply or write your own..."
                    spellCheck
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 mt-3 shrink-0 border-t border-white/[0.06] bg-[#1a1a1a] pt-4">
            {sendError ? (
              <div className="mb-2 text-center text-xs leading-snug text-red-300">{sendError}</div>
            ) : sendSuccess ? (
              <div className="mb-2 text-center text-xs leading-snug text-emerald-300/95">
                {sendSuccess}
              </div>
            ) : null}
            <button
              type="button"
              className="w-full rounded-[10px] border-2 border-[var(--openmail-cta-fill)] bg-[var(--openmail-cta-fill)] px-3 py-3.5 text-sm font-semibold tracking-wide text-[var(--openmail-cta-text)] shadow-[0_0_28px_var(--openmail-cta-glow)] transition-all duration-150 hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:brightness-100"
              onClick={onSendReply}
              disabled={sending || !replyState.currentReply.trim() || !selectedMail}
            >
              {sending ? "Sending..." : "Send reply"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
