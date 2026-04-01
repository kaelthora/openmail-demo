"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getContactProfile, updateContactProfile } from "@/lib/relationshipEngine";
import { getContext, resetAllContext, updateContext } from "@/lib/contextEngine";
import ComposeControlPanel from "./ComposeControlPanel";

type ContactProfile = { preferredTone?: string } | null;

/** Pause ~500ms after typing stops, then refresh suggestions (no extra API latency). */
const LIVE_SUGGEST_DEBOUNCE_MS = 500;
const MIN_INTENT_CHARS = 2;

function suggestionToneClass(tone: string): string {
  const t = tone.toLowerCase();
  if (t === "friendly") return "compose-suggestion-card--friendly";
  if (t === "direct") return "compose-suggestion-card--direct";
  if (t === "casual") return "compose-suggestion-card--casual";
  return "compose-suggestion-card--professional";
}

function buildReplyText(
  optionTone: string,
  originalContext: string,
  threadEmail: string
) {
  const base = originalContext || "your message";
  const promptTemplate = `Based on this conversation context:
${base}

And this new email:
${threadEmail || "No new email provided."}

Write a coherent reply in the appropriate tone.`;
  if (optionTone === "Friendly") {
    return `Prompt:\n${promptTemplate}\n\nHi there,\n\nThanks for your email. I reviewed your message and I am happy to help. I can follow up with the requested details shortly.\n\nBest,\n`;
  }
  if (optionTone === "Direct") {
    return `Prompt:\n${promptTemplate}\n\nHello,\n\nReceived. I reviewed your message. I will send the requested update today.\n\nRegards,\n`;
  }
  return `Prompt:\n${promptTemplate}\n\nHello,\n\nThank you for your message. I have reviewed your email and will provide a complete response with next steps shortly.\n\nBest regards,\n`;
}

type ReplyOption = { id: string; tone: string; label: string; text: string };

function normalizeApiSuggestionsToReplyOptions(
  items: Array<{ tone?: string; text: string }>,
  fallbackTone: string
): ReplyOption[] {
  return items.slice(0, 3).map((s, i) => {
    const toneVal =
      typeof s.tone === "string" && s.tone.trim() ? s.tone.trim() : fallbackTone;
    return {
      id: `draft-sugg-${i}-${toneVal}`,
      tone: toneVal,
      label: toneVal,
      text: String(s.text).trim(),
    };
  });
}

function clientDraftFallback(draft: string, tone: string): ReplyOption[] {
  const base = draft.trim();
  return [
    { id: "draft-fb-0", tone, label: tone, text: base },
    {
      id: "draft-fb-1",
      tone,
      label: tone,
      text: `${base}\n\n(${tone} polish: same message, tighter wording.)`,
    },
    {
      id: "draft-fb-2",
      tone,
      label: tone,
      text: `${base}\n\nThanks,`,
    },
  ];
}

type LengthMode = "short" | "detailed";

function ComposeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const context = params.get("context") || "";
  const freshToken = params.get("fresh");
  const [recipient, setRecipient] = useState("");
  const [contactProfile, setContactProfile] = useState<ContactProfile>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Professional");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [responseOptions, setResponseOptions] = useState<ReplyOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [preferredTone, setPreferredTone] = useState("Professional");
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [isWritingFocus, setIsWritingFocus] = useState(false);
  const [suggestionsEpoch, setSuggestionsEpoch] = useState(0);
  const [isDebouncingSuggestions, setIsDebouncingSuggestions] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [lengthMode, setLengthMode] = useState<LengthMode>("detailed");
  const [aiAssistEnabled, setAiAssistEnabled] = useState(true);
  const contextSuggestionsPrimedRef = useRef(false);

  const thinkingMessages = [
    "Analyzing intent...",
    "Detecting risk patterns...",
    "Understanding context...",
    "Generating optimal reply...",
  ];

  function playSound(file: "click" | "success" | "alert") {
    const audio = new Audio(`/sounds/${file}.mp3`);
    audio.volume = 0.2;
    void audio.play().catch(() => {});
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button")) playSound("click");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".magnetic-btn")
    );

    const cleanups = buttons.map((button) => {
      const onMove = (event: MouseEvent) => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - (rect.left + rect.width / 2);
        const y = event.clientY - (rect.top + rect.height / 2);
        const mx = (x / rect.width) * 6;
        const my = (y / rect.height) * 6;
        button.style.setProperty("--mx", `${mx}px`);
        button.style.setProperty("--my", `${my}px`);
      };

      const onLeave = () => {
        button.style.setProperty("--mx", "0px");
        button.style.setProperty("--my", "0px");
      };

      button.addEventListener("mousemove", onMove);
      button.addEventListener("mouseleave", onLeave);

      return () => {
        button.removeEventListener("mousemove", onMove);
        button.removeEventListener("mouseleave", onLeave);
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      setThinkingIndex((prev) => (prev + 1) % thinkingMessages.length);
    }, 1200);

    return () => clearInterval(interval);
  }, [loading, thinkingMessages.length]);

  /* Fresh reset, hydrate draft, or apply inbox context */
  useEffect(() => {
    if (freshToken) {
      localStorage.removeItem("openmail-compose-draft");
      resetAllContext();
      contextSuggestionsPrimedRef.current = false;
      setRecipient("");
      setContactProfile(null);
      setTo("");
      setSubject("");
      setBody("");
      setPrompt("");
      setTone("Professional");
      setPreferredTone("Professional");
      setFeedback("");
      setResponseOptions([]);
      setSelectedOptionId("");
      setThinkingIndex(0);
      setIsWritingFocus(false);
      setSuggestionsEpoch(0);
      setIsDebouncingSuggestions(false);
      setIsFetchingSuggestions(false);
      setLengthMode("detailed");
      setAiAssistEnabled(true);
      setLoading(false);
      router.replace("/openmail/compose", { scroll: false });
      return;
    }

    const saved = localStorage.getItem("openmail-compose-draft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTo(parsed.to || "");
        setRecipient(parsed.to || "");
        setSubject(parsed.subject || "");
        setBody(parsed.body || "");
        setPrompt(parsed.prompt || "");
        setTone(parsed.tone || "Professional");
        setPreferredTone(parsed.preferredTone || "Professional");
        if (parsed.lengthMode === "short" || parsed.lengthMode === "detailed") {
          setLengthMode(parsed.lengthMode);
        }
        if (typeof parsed.aiAssistEnabled === "boolean") {
          setAiAssistEnabled(parsed.aiAssistEnabled);
        }
      } catch {
        // Ignore malformed local draft
      }
    }

    if (context) {
      setPrompt(`Reply to this message: ${context}`);
    }
  }, [freshToken, context, router]);

  useEffect(() => {
    if (params.get("fresh")) return;
    localStorage.setItem(
      "openmail-compose-draft",
      JSON.stringify({
        to,
        subject,
        body,
        prompt,
        tone,
        preferredTone,
        lengthMode,
        aiAssistEnabled,
      })
    );
  }, [
    to,
    subject,
    body,
    prompt,
    tone,
    preferredTone,
    lengthMode,
    aiAssistEnabled,
    params,
  ]);

  function toneGuideline(selectedTone: string) {
    if (selectedTone === "Casual") return "Keep it conversational and short.";
    if (selectedTone === "Friendly") return "Use warm wording and positive language.";
    if (selectedTone === "Direct") return "Be concise, clear, and action-oriented.";
    return "Use a polished and professional business style.";
  }

  function simulateDelay(next: () => void) {
    setThinkingIndex(0);
    setLoading(true);
    setTimeout(() => {
      next();
      setThinkingIndex(0);
      setLoading(false);
    }, 450);
  }

  const generateReplyOptions = useCallback(() => {
    const contactContext = recipient.trim() ? getContext(recipient) : null;
    const combinedContext = [
      ...(contactContext?.lastMessages || []),
      context,
      prompt.trim() || undefined,
    ]
      .filter(Boolean)
      .join("\n");
    const defaults = ["Professional", "Friendly", "Direct"];
    const tonesList = !defaults.includes(preferredTone)
      ? defaults
      : [preferredTone, ...defaults.filter((item) => item !== preferredTone)];
    const tonesForOptions = tonesList.slice(0, 3);
    const options = tonesForOptions.map((optionTone) => ({
      id: optionTone.toLowerCase(),
      tone: optionTone,
      label: optionTone,
      text: buildReplyText(optionTone, combinedContext || context || prompt, context),
    }));
    setResponseOptions(options);
  }, [recipient, context, prompt, preferredTone]);

  /* Live suggestions: debounce + draft API or intent (client) */
  useEffect(() => {
    const draftTrim = body.trim();
    const hasIntent =
      Boolean(context.trim()) || prompt.trim().length >= MIN_INTENT_CHARS;

    if (!aiAssistEnabled) {
      setIsDebouncingSuggestions(false);
      setIsFetchingSuggestions(false);
      setResponseOptions([]);
      return;
    }

    if (!draftTrim && !hasIntent) {
      setIsDebouncingSuggestions(false);
      setIsFetchingSuggestions(false);
      setResponseOptions([]);
      return;
    }

    const instantContextPass =
      Boolean(context.trim()) &&
      !contextSuggestionsPrimedRef.current &&
      !draftTrim;
    if (instantContextPass) {
      contextSuggestionsPrimedRef.current = true;
    }

    const delayMs =
      draftTrim || !instantContextPass || !hasIntent
        ? LIVE_SUGGEST_DEBOUNCE_MS
        : 0;

    if (delayMs > 0 && (draftTrim || hasIntent)) {
      setIsDebouncingSuggestions(true);
    } else {
      setIsDebouncingSuggestions(false);
    }

    const ac = new AbortController();

    const id = window.setTimeout(() => {
      void (async () => {
        if (ac.signal.aborted) return;

        if (draftTrim) {
          setIsDebouncingSuggestions(false);
          setIsFetchingSuggestions(true);
          try {
            const res = await fetch("/api/compose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "draft_suggestions",
                draft: draftTrim,
                tone,
                length: lengthMode,
              }),
              signal: ac.signal,
            });
            const data = (await res.json()) as {
              suggestions?: Array<{ tone?: string; text: string }>;
            };
            if (ac.signal.aborted) return;
            if (
              res.ok &&
              Array.isArray(data.suggestions) &&
              data.suggestions.length > 0
            ) {
              setResponseOptions(
                normalizeApiSuggestionsToReplyOptions(data.suggestions, tone)
              );
            } else {
              setResponseOptions(clientDraftFallback(draftTrim, tone));
            }
            setSuggestionsEpoch((n) => n + 1);
          } catch {
            if (ac.signal.aborted) return;
            setResponseOptions(clientDraftFallback(draftTrim, tone));
            setSuggestionsEpoch((n) => n + 1);
          } finally {
            if (!ac.signal.aborted) {
              setIsFetchingSuggestions(false);
            }
          }
          return;
        }

        setIsDebouncingSuggestions(false);
        if (hasIntent) {
          generateReplyOptions();
          setSuggestionsEpoch((n) => n + 1);
        } else {
          setResponseOptions([]);
        }
      })();
    }, delayMs);

    return () => {
      ac.abort();
      window.clearTimeout(id);
      setIsDebouncingSuggestions(false);
      setIsFetchingSuggestions(false);
    };
  }, [
    body,
    tone,
    context,
    prompt,
    recipient,
    preferredTone,
    generateReplyOptions,
    aiAssistEnabled,
    lengthMode,
  ]);

  function generateEmail() {
    const contactContext = recipient.trim() ? getContext(recipient) : null;
    const toLabel = to || "the recipient";
    const request = [
      ...(contactContext?.lastMessages || []),
      prompt || "Share a quick update and next steps.",
      context,
    ]
      .filter(Boolean)
      .join("\n");
    const opening =
      lengthMode === "detailed"
        ? `Hi ${toLabel},\n\nI hope you are doing well.\n\n`
        : `Hi ${toLabel},\n\n`;
    const core =
      lengthMode === "short" && request.length > 280
        ? `${request.slice(0, 277).trim()}…`
        : request;
    const closing =
      lengthMode === "detailed"
        ? `\n\n${toneGuideline(tone)}\n\nPlease let me know if you would like any additional details.\n\nBest regards,`
        : `\n\n${toneGuideline(tone)}\n\nThanks,\n`;
    const generated = `${opening}${core}${closing}`;

    simulateDelay(() => {
      setBody(generated);
      if (recipient.trim()) {
        updateContext(recipient, generated);
      }
      setFeedback("AI generated a new draft.");
    });
  }

  function improveEmail() {
    if (!body.trim()) return;
    const improved = `${body.trim()}\n\nP.S. I am happy to adjust this based on your preferences.`;
    simulateDelay(() => {
      setBody(improved);
      setFeedback("AI improved your draft.");
    });
  }

  function shortenEmail() {
    if (!body.trim()) return;
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
    const concise = `${lines.join("\n")}\n\nBest regards,`;
    simulateDelay(() => {
      setBody(concise);
      setFeedback("AI shortened your draft.");
    });
  }

  function changeTone() {
    if (!body.trim()) return;
    const toned = `${body.trim()}\n\n[Tone adjusted: ${tone}. ${toneGuideline(tone)}]`;
    simulateDelay(() => {
      setBody(toned);
      setFeedback(`AI changed tone to ${tone}.`);
    });
  }

  function selectReplyOption(option: ReplyOption) {
    if (recipient.trim()) {
      updateContactProfile(recipient, {
        preferredTone: option.tone,
        lastSelectedStyle: option.tone,
      });
      updateContext(recipient, option.text);
    }
    setSelectedOptionId(option.id);
    setBody(option.text);
    setTone(option.tone);
    setPreferredTone(option.tone);
    setFeedback("AI adapted to your tone");
    playSound("success");
  }

  const showSuggestions = responseOptions.length > 0;
  const liveIntentActive =
    aiAssistEnabled &&
    (Boolean(body.trim()) ||
      Boolean(context.trim()) ||
      prompt.trim().length >= MIN_INTENT_CHARS);

  return (
    <div className="compose-page-root min-h-screen px-5 py-8 md:px-10 md:py-12">
      <div className="max-w-3xl mx-auto glass compose-shell panel-elev-2 p-6 md:p-10 space-y-8 fade-in">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="compose-eyebrow mb-1.5">AI Native Writing</p>
            <h1 className="compose-title">Think it. Say it.</h1>
          </div>
          {loading ? (
            <span className="text-sm text-soft ai-thinking-text whitespace-nowrap">
              {thinkingMessages[thinkingIndex]}
            </span>
          ) : null}
        </header>

        {/* Central “thinking” input */}
        <section className="space-y-3">
          <label htmlFor="compose-intent" className="compose-hero-label block">
            What do you want to say?
          </label>
          <textarea
            id="compose-intent"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your intent — reply ideas refresh live after a brief pause."
            className="compose-hero-input"
            rows={5}
            aria-describedby="compose-intent-hint"
          />
          <p id="compose-intent-hint" className="text-xs text-soft/90">
            {!aiAssistEnabled
              ? "AI assist is off — enable “Live suggestions” in AI Control for debounced draft suggestions."
              : liveIntentActive
                ? "Pause typing — live suggestions follow your draft and intent (500ms debounce). No need to press Generate."
                : `Type in the draft or intent (${MIN_INTENT_CHARS}+ chars), or open from inbox with context.`}
          </p>
        </section>

        <section
          className="compose-control-section"
          aria-labelledby="compose-ai-control-heading"
        >
          <h2 id="compose-ai-control-heading" className="compose-control-heading">
            AI Control
          </h2>
          {true && (
            <ComposeControlPanel
              tone={tone}
              onToneChange={(t) => {
                setTone(t);
                setPreferredTone(t);
              }}
              lengthMode={lengthMode}
              onLengthChange={setLengthMode}
              aiAssistEnabled={aiAssistEnabled}
              onAiAssistToggle={() => setAiAssistEnabled((v) => !v)}
            />
          )}
        </section>

        {/* Live AI suggestions (debounced) */}
        {liveIntentActive ? (
          <section
            className={`compose-suggestions-live space-y-3 ${isWritingFocus ? "focus-dim" : ""}`}
            aria-label="AI reply suggestions"
          >
            <div className="compose-ai-drafting-with-you">
              <span className="compose-ai-drafting-dot" aria-hidden />
              <span>AI is drafting with you</span>
              {isDebouncingSuggestions || isFetchingSuggestions ? (
                <span className="compose-ai-drafting-pulse" aria-hidden />
              ) : null}
            </div>

            {showSuggestions ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="compose-suggestions-head">Suggested replies</span>
                  <span className="text-xs text-soft">Preferred: {preferredTone}</span>
                </div>
                <div
                  key={suggestionsEpoch}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3 compose-suggestions-grid-replace"
                >
              {responseOptions.map((option, index) => {
                const selected = selectedOptionId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectReplyOption(option)}
                    style={{ animationDelay: `${index * 55}ms` }}
                    className={`compose-suggestion-card compose-suggestion-live-in ${suggestionToneClass(option.tone)} ${
                      selected ? "compose-suggestion-card--selected" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2 relative z-[1]">
                      <span className="compose-tone-pill">{option.tone}</span>
                      {selected ? (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-violet-200/90">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="compose-suggestion-preview whitespace-pre-line relative z-[1]">
                      {option.text.split("\n").slice(0, 4).join("\n")}
                    </p>
                  </button>
                );
              })}
                </div>
              </>
            ) : isDebouncingSuggestions || isFetchingSuggestions ? (
              <p className="compose-suggestions-waiting text-xs text-soft">
                {isFetchingSuggestions
                  ? "Fetching AI suggestions…"
                  : "Updating suggestions…"}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Meta: recipient & subject */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isWritingFocus ? "focus-dim" : ""}`}
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-soft">To</label>
            <input
              value={recipient}
              onChange={(e) => {
                const email = e.target.value;
                setRecipient(email);
                setTo(email);
                const profile = getContactProfile(email);
                setContactProfile(profile);
                if (profile?.preferredTone) {
                  setTone(profile.preferredTone);
                }
              }}
              placeholder="name@company.com"
              className="w-full compose-meta-field outline-none"
            />
            {recipient ? (
              <p className="text-xs text-soft">
                {contactProfile
                  ? "AI tuned for this contact"
                  : "New contact — learning your style"}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-soft">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full compose-meta-field outline-none"
            />
          </div>
        </div>

        {/* Draft body */}
        <div className={`space-y-2 ${isWritingFocus ? "focus-active" : ""}`}>
          <label htmlFor="compose-body" className="text-xs font-medium text-soft">
            Draft
          </label>
          <textarea
            id="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setIsWritingFocus(true)}
            onBlur={() => setIsWritingFocus(false)}
            className="w-full compose-body-area outline-none"
            rows={10}
          />
        </div>

        {/* Actions */}
        <div className={`space-y-3 ${isWritingFocus ? "focus-dim" : ""}`}>
          <button
            type="button"
            onClick={generateEmail}
            className="btn-primary compose-btn-generate interactive glow-hover magnetic-btn w-full sm:w-auto"
            title="Optional: expand intent into a longer draft — live suggestions update above without this"
          >
            Generate
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={improveEmail}
              className="compose-btn-secondary magnetic-btn"
            >
              Improve
            </button>
            <button
              type="button"
              onClick={shortenEmail}
              className="compose-btn-secondary magnetic-btn"
            >
              Shorten
            </button>
            <button
              type="button"
              onClick={changeTone}
              className="compose-btn-secondary magnetic-btn"
            >
              Change tone
            </button>
          </div>
        </div>

        {feedback ? <div className="compose-feedback-pill">{feedback}</div> : null}
      </div>
    </div>
  );
}

export default function Compose() {
  return (
    <Suspense
      fallback={
        <div className="compose-page-root min-h-screen p-7 md:p-10 relative z-10 text-soft">
          Loading compose...
        </div>
      }
    >
      <ComposeContent />
    </Suspense>
  );
}
