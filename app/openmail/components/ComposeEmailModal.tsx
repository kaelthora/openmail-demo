"use client";

import { useCallback, useEffect, useId, useState } from "react";

export type ComposeEmailDraft = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachmentLabels: string[];
};

type ComposeEmailModalProps = {
  open: boolean;
  onClose: () => void;
  /** Mock send — no network; parent may show toast */
  onSend?: (draft: ComposeEmailDraft) => void;
};

const inputClass =
  "w-full rounded-[10px] border border-white/[0.08] bg-[#0c0c0c] px-3 py-2 text-[13px] text-[var(--text-main)] placeholder:text-[color:var(--text-soft)]/45 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent)]/40 focus:shadow-[0_0_0_1px_var(--openmail-shadow-accent-sm)]";

const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]";

function initialDraft(): ComposeEmailDraft {
  return {
    to: "",
    cc: "",
    subject: "",
    body: "",
    attachmentLabels: [],
  };
}

export function ComposeEmailModal({ open, onClose, onSend }: ComposeEmailModalProps) {
  const titleId = useId();
  const [draft, setDraft] = useState(initialDraft);

  const reset = useCallback(() => {
    setDraft(initialDraft());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    reset();
  }, [open, reset]);

  const handleSend = () => {
    onSend?.(draft);
    reset();
    onClose();
  };

  const addMockAttachment = () => {
    setDraft((d) => ({
      ...d,
      attachmentLabels: [
        ...d.attachmentLabels,
        `attachment_${d.attachmentLabels.length + 1}.pdf`,
      ],
    }));
  };

  const removeAttachment = (index: number) => {
    setDraft((d) => ({
      ...d,
      attachmentLabels: d.attachmentLabels.filter((_, i) => i !== index),
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Close composer"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[121] flex max-h-[min(92vh,720px)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a] shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.04)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <h2 id={titleId} className="text-sm font-semibold tracking-tight text-[var(--text-main)]">
            New message
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)]"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="compose-to" className={labelClass}>
                To
              </label>
              <input
                id="compose-to"
                type="email"
                className={inputClass}
                placeholder="name@example.com"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="compose-cc" className={labelClass}>
                CC
              </label>
              <input
                id="compose-cc"
                type="text"
                className={inputClass}
                placeholder="Optional"
                value={draft.cc}
                onChange={(e) => setDraft((d) => ({ ...d, cc: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="compose-subject" className={labelClass}>
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                className={inputClass}
                placeholder="Subject"
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="compose-body" className={labelClass}>
                Message
              </label>
              <textarea
                id="compose-body"
                rows={8}
                className={`${inputClass} min-h-[160px] resize-y font-[system-ui,sans-serif] leading-relaxed`}
                placeholder="Write your message…"
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
            </div>

            <div>
              <span className={labelClass}>Attachments</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-[10px] border border-dashed border-white/[0.14] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:border-[var(--accent)]/35 hover:bg-white/[0.04] hover:text-[var(--text-main)]"
                  onClick={addMockAttachment}
                >
                  Add attachment
                </button>
                {draft.attachmentLabels.map((name, i) => (
                  <span
                    key={`${name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#111] px-2.5 py-1 text-[11px] text-[color:var(--text-soft)]"
                  >
                    <span className="max-w-[180px] truncate" title={name}>
                      {name}
                    </span>
                    <button
                      type="button"
                      className="rounded px-1 text-[var(--text-main)]/50 hover:bg-white/[0.08] hover:text-[var(--text-main)]"
                      aria-label={`Remove ${name}`}
                      onClick={() => removeAttachment(i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-[color:var(--text-soft)]/55">
                UI preview only — files are not uploaded.
              </p>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3.5">
          <button
            type="button"
            className="rounded-[10px] px-4 py-2 text-xs font-medium text-[color:var(--text-soft)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-[10px] border border-[var(--accent)]/45 bg-[var(--accent)]/12 px-4 py-2 text-xs font-semibold text-[var(--text-main)] shadow-[0_0_20px_var(--openmail-shadow-accent-xs)] transition-[background-color,border-color] hover:border-[var(--accent)]/65 hover:bg-[var(--accent)]/20"
            onClick={handleSend}
          >
            Send
          </button>
        </footer>
      </div>
    </div>
  );
}
