"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";
import BootScreen from "../components/BootScreen";
import { EmailBodyWithLinks } from "../../components/EmailBodyWithLinks";
import { MailAttachments } from "../../components/MailAttachments";
import {
  Engine,
  Render,
  Runner,
  Bodies,
  Composite,
  Mouse,
  MouseConstraint,
} from "matter-js";
import { THEMES, THEME_ICON_FALLBACK } from "../../lib/themes";
import { getRiskPresentation } from "@/lib/mailSecuritySignals";
import { mailContainsDetectableUrls } from "@/lib/emailContentHints";
import { useMailStore } from "./MailStoreProvider";
import { OpenmailSecurityProvider } from "./OpenmailSecurityProvider";
import type { MailItem, ProcessedMail } from "@/lib/mailTypes";
import { processMails, getAttentionScore } from "@/lib/mailProcess";
import { OpenMailIcon } from "@/lib/icons";
import {
  applyProviderConfigFromEmail,
  emptyAccountProfile,
  isAccountConfigured,
  type OpenMailAccountProfile,
} from "@/lib/mailAccountConfig";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";

type ThreatVariant = "safe" | "suspicious" | "blocked";

function openMailThreatPresentation(mail: ProcessedMail): {
  label: "SAFE" | "SUSPICIOUS" | "BLOCKED";
  score: number;
  variant: ThreatVariant;
} {
  const dc = mail.demoClassification;
  if (dc) {
    return {
      label: dc.label,
      score: Math.round(dc.score),
      variant:
        dc.label === "BLOCKED"
          ? "blocked"
          : dc.label === "SUSPICIOUS"
            ? "suspicious"
            : "safe",
    };
  }
  if (mail.securityLevel === "high_risk") {
    return {
      label: "BLOCKED",
      score: Math.round(mail.securityRiskScore),
      variant: "blocked",
    };
  }
  if (mail.securityLevel === "suspicious") {
    return {
      label: "SUSPICIOUS",
      score: Math.round(mail.securityRiskScore),
      variant: "suspicious",
    };
  }
  return {
    label: "SAFE",
    score: Math.round(mail.securityRiskScore),
    variant: "safe",
  };
}

export default function Home() {
  type ThemeMode = (typeof THEMES)[number]["id"];

  function glowForTheme(mode: ThemeMode, alpha: number): string {
    const a = Math.min(Math.max(alpha, 0), 1);
    if (mode === "voidbeast") return `rgba(0,255,150,${a})`;
    if (mode === "nova") return `rgba(180,220,255,${a})`;
    if (mode === "orbital") return `rgba(120,200,255,${a})`;
    if (mode === "blacken") return `rgba(255,59,59,${a})`;
    if (mode === "ember") return `rgba(255,120,60,${a})`;
    return `rgba(143,117,255,${a})`;
  }

  const {
    mails,
    setMails,
    selectedMailId,
    setSelectedMailId,
    mailsHydrated,
    account: storedAccount,
    accountHydrated,
    accountConnected,
    saveAccount,
    syncFromImap,
    isSyncing,
    syncError,
    clearSyncError,
    markMailRead,
    softDeleteMail,
    sendReplyMail,
    mockScheduleMail,
  } = useMailStore();

  /** ⚡ in list: only when AI urgency, actionable intent, or security anomaly — not decoration */
  function shouldShowMailListPriorityBolt(mail: ProcessedMail): boolean {
    if (mail.securityLevel === "suspicious" || mail.securityLevel === "high_risk") {
      return true;
    }
    if (mail.priority === "urgent") {
      return true;
    }
    if (
      mail.intent === "schedule" ||
      mail.intent === "reply" ||
      mail.intent === "follow_up"
    ) {
      return true;
    }
    if (mail.needsReply && mail.intent === "read") {
      return true;
    }
    return false;
  }

  function priorityTierRank(p: MailItem["priority"] | undefined): number {
    if (p === "urgent") return 3;
    if (p === "medium") return 2;
    return 1;
  }

  /** Importance = model priority signals, not raw confidence alone. */
  function compareMailItems(
    a: ProcessedMail,
    b: ProcessedMail,
    mode: "importance" | "date"
  ): number {
    if (mode === "importance") {
      const ps = b.priorityScore - a.priorityScore;
      if (ps !== 0) return ps;
      const att = b.attentionScore - a.attentionScore;
      if (att !== 0) return att;
      const pr = priorityTierRank(b.priority) - priorityTierRank(a.priority);
      if (pr !== 0) return pr;
      const nr = (b.needsReply ? 1 : 0) - (a.needsReply ? 1 : 0);
      if (nr !== 0) return nr;
      return b.confidence - a.confidence;
    }
    return new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
  }

  type FlowVisualTier = "hero" | "standard" | "compact";

  function flowVisualTier(mail: ProcessedMail): FlowVisualTier {
    if (mail.priority === "urgent" || mail.priorityScore >= 52) return "hero";
    if (mail.priority === "medium" || mail.priorityScore >= 26) return "standard";
    return "compact";
  }

  function flowGroupTitle(mails: ProcessedMail[]): string {
    const m = mails[0];
    if (m.thread) {
      return m.thread.replace(/-/g, " ");
    }
    if (m.sender) {
      const local = m.sender.split("@")[0];
      return local ? local.replace(/\./g, " ") : "Thread";
    }
    if (m.cluster !== "other") {
      return m.cluster;
    }
    return "Related";
  }

  type FlowPrimaryKind =
    | "reply_soon"
    | "confirm_schedule"
    | "fyi"
    | "payment"
    | "resolved"
    | "calendar";

  /** Single dominant headline per card — matches FLOW taxonomy. */
  function getFlowPrimaryAction(mail: ProcessedMail): {
    kind: FlowPrimaryKind;
    label: string;
  } {
    if (mail.resolved) return { kind: "resolved", label: "RESOLVED" };
    if (mail.scheduled) return { kind: "calendar", label: "ON CALENDAR" };
    if (mail.intent === "pay") return { kind: "payment", label: "PAY INVOICE" };
    if (mail.intent === "schedule") {
      return { kind: "confirm_schedule", label: "CONFIRM / RESCHEDULE" };
    }
    if (mail.needsReply && (mail.intent === "reply" || mail.intent === "follow_up")) {
      return { kind: "reply_soon", label: "REPLY SOON" };
    }
    if (mail.needsReply) return { kind: "reply_soon", label: "REPLY SOON" };
    if (mail.intent === "read") return { kind: "fyi", label: "FYI" };
    return { kind: "fyi", label: "FYI" };
  }

  function isFlowClusterExpanded(
    key: string,
    mails: ProcessedMail[],
    overrides: Record<string, boolean | undefined>
  ): boolean {
    const o = overrides[key];
    if (o !== undefined) return o;
    if (mails.length <= 1) return true;
    return !mails.slice(1).every(
      (m) => m.priority === "low" && m.priorityScore < 38
    );
  }

  type InboxListRow =
    | {
        type: "flow-group";
        clusterKey: string;
        title: string;
        total: number;
        leader: ProcessedMail;
        followers: ProcessedMail[];
        leaderTier: FlowVisualTier;
      }
    | { type: "mail"; mail: ProcessedMail; flowTier?: FlowVisualTier }

  const [bootDone, setBootDone] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [hoveredMailId, setHoveredMailId] = useState<string | null>(null);
  const hoveredMailIdRef = useRef<string | null>(hoveredMailId);
  hoveredMailIdRef.current = hoveredMailId;
  const [focusedClusterKey, setFocusedClusterKey] = useState<
    ProcessedMail["cluster"] | null
  >(null);
  const focusedClusterKeyRef = useRef<ProcessedMail["cluster"] | null>(
    focusedClusterKey
  );
  focusedClusterKeyRef.current = focusedClusterKey;
  const [aiReply, setAiReply] = useState("");
  /** Raw AI / neutral reply before tone transforms (source of truth for re-toning). */
  const [baseReply, setBaseReply] = useState("");
  /** Toned reply variants (Option 1–3) for the intent-based engine. */
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestionsRef = useRef<string[]>([]);
  suggestionsRef.current = suggestions;
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [aiReplyReveal, setAiReplyReveal] = useState(false);
  const replyVariantSeedsRef = useRef<string[]>([]);
  const sortedMailsRef = useRef<ProcessedMail[]>([]);
  /** User intent: what they want the reply to accomplish (drives generation). */
  const [replyIntent, setReplyIntent] = useState("");
  const replyIntentRef = useRef(replyIntent);
  replyIntentRef.current = replyIntent;
  /** Optional phrases / bullets the user wants woven in. */
  const [replyOptionalDraft, setReplyOptionalDraft] = useState("");
  const replyOptionalDraftRef = useRef(replyOptionalDraft);
  replyOptionalDraftRef.current = replyOptionalDraft;
  const [showWhyThisReply, setShowWhyThisReply] = useState(false);
  const [whyThisReplyExplanation, setWhyThisReplyExplanation] = useState("");
  type Tone = "Professional" | "Friendly" | "Direct" | "Short";
  const toneOptions: Tone[] = ["Professional", "Friendly", "Direct", "Short"];
  const [committedTone, setCommittedTone] = useState<Tone>("Professional");
  const committedToneRef = useRef<Tone>(committedTone);
  committedToneRef.current = committedTone;
  const [hoveredTone, setHoveredTone] = useState<Tone | null>(null);
  const tonePreviewBackupRef = useRef<string | null>(null);
  const replyTypingTimerRef = useRef<number | null>(null);
  /** AI-related micro-delays (80–160ms) — smart actions, tone preview */
  const aiSmartDelayTimerRef = useRef<number | null>(null);
  const tonePreviewDelayTimerRef = useRef<number | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [predictedAction, setPredictedAction] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("inbox");
  const [displayMode, setDisplayMode] = useState<"flow" | "grid" | "list">("flow");
  const [openedMail, setOpenedMail] = useState<ProcessedMail | null>(null);
  const [openedMailRect, setOpenedMailRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isMailFullscreenOpen, setIsMailFullscreenOpen] = useState(false);
  const [aiInsightPanelMailId, setAiInsightPanelMailId] = useState<string | null>(
    null
  );
  const [featureWipModal, setFeatureWipModal] = useState<
    "contacts" | "calendar" | null
  >(null);
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const [manualMode, setManualMode] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("aether");
  const [themePreviewMode, setThemePreviewMode] = useState<ThemeMode | null>(null);
  const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);
  const [sortMode, setSortMode] = useState<"importance" | "date">("importance");
  const [flowClusterExpanded, setFlowClusterExpanded] = useState<
    Record<string, boolean>
  >({});
  const [aiAssistEnabled, setAiAssistEnabled] = useState(true);
  const [smartActionsEnabled, setSmartActionsEnabled] = useState(true);
  const [contextSource, setContextSource] = useState<"mail" | "thread" | "global">("mail");
  function replyPanelContextSourceLabel(
    source: "mail" | "thread" | "global"
  ): string {
    if (source === "mail") return "Mail";
    if (source === "thread") return "Thread";
    return "Global";
  }
  const [smartFolders, setSmartFolders] = useState<Record<string, ProcessedMail[]>>({});
  const [mailContexts, setMailContexts] = useState<Record<string, ProcessedMail[]>>({});
  const [userStats, setUserStats] = useState({
    actions: 0,
    hovers: 0,
    hesitation: 0,
  });
  const [lastUpdate, setLastUpdate] = useState(0);
  const mailRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flowSlotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevFlowSlotTops = useRef<Record<string, number>>({});
  const appLayoutRef = useRef<HTMLDivElement | null>(null);
  /** Predictive UI: intent preview (~350ms) then selection + preload (~480ms); click flushes immediately */
  const predictiveHoverTimerRef = useRef<number | null>(null);
  const intentPreviewTimerRef = useRef<number | null>(null);
  const pendingPredictiveMailRef = useRef<string | null>(null);
  const [predictiveWarmMailId, setPredictiveWarmMailId] = useState<string | null>(null);
  const [intentPreviewMailId, setIntentPreviewMailId] = useState<string | null>(null);
  const [idleAttentionMailId, setIdleAttentionMailId] = useState<string | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const [linkThreatFlash, setLinkThreatFlash] = useState(false);
  const isHoveringMail = useRef(false);
  const SHOW_MAIL_CONNECTORS = false;

  const mailHoverStartRef = useRef<Record<string, number>>({});
  const handleActionRef = useRef<(action: string) => void>(() => {});
  const backgroundEffectsRef = useRef<HTMLDivElement | null>(null);

  const AUTO_MODE = false;

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuActiveAction, setMenuActiveAction] = useState<
    "inbox" | "drafts" | "sync" | "settings" | "contacts"
  >("inbox");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [accountConnectStep, setAccountConnectStep] = useState<"input" | "loading" | "manual">(
    "input"
  );
  const [accountConnectHint, setAccountConnectHint] = useState("");
  const [accountConnectError, setAccountConnectError] = useState("");
  const [accountDraft, setAccountDraft] = useState<OpenMailAccountProfile>(() =>
    emptyAccountProfile()
  );

  useEffect(() => {
    if (!accountModalOpen) return;
    setAccountDraft(
      storedAccount ? structuredClone(storedAccount) : emptyAccountProfile()
    );
    setSetupEmail(storedAccount?.email ?? "");
    setSetupPassword("");
    setAccountConnectStep("input");
    setAccountConnectHint("");
    setAccountConnectError("");
  }, [accountModalOpen, storedAccount]);

  /* Adaptive display: never override manual UI mode. */
  useEffect(() => {
    if (isHoveringMail.current) return;
    if (manualMode) return;

    const now = Date.now();
    if (now - lastUpdate < 2000) return;

    setLastUpdate(now);

    if (userStats.actions > 5 && userStats.hesitation < 2) {
      setDisplayMode("flow");
    } else if (userStats.hesitation > 6) {
      setDisplayMode("list");
    } else if (userStats.hesitation > 3) {
      setDisplayMode("grid");
    }
  }, [userStats, manualMode]);

  const folders = [
    "inbox",
    "quarantine",
    "drafts",
    "sent",
    "ai_flagged",
    "follow_ups",
    "delete",
  ];

  const menuActions: Array<{
    key: "inbox" | "drafts" | "sync" | "settings" | "contacts";
    label: string;
    icon: "inbox" | "draft" | "sync" | "settings" | "contacts";
    disabled?: boolean;
    breathing?: boolean;
  }> = [
    { key: "inbox", label: "Inbox", icon: "inbox" },
    { key: "drafts", label: "Drafts", icon: "draft" },
    {
      key: "sync",
      label: isSyncing ? "Syncing..." : "Sync",
      icon: "sync",
      disabled: OPENMAIL_DEMO_MODE || !accountConnected || isSyncing,
      breathing: true,
    },
    { key: "settings", label: "Settings", icon: "settings" },
    { key: "contacts", label: "Contacts", icon: "contacts" },
  ];

  /** Percentage anchors for cluster-field math (grid/list); not used for stack flow. */
  function flowBaseForIndex(index: number) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return { x: 25 + col * 25, y: 20 + row * 18 };
  }

  function generateSmartFolders(inputMails: ProcessedMail[]) {
    const foldersMap: Record<string, ProcessedMail[]> = {};

    inputMails.forEach((mail) => {
      if (mail.securityLevel === "high_risk") return;

      const text = `${mail.subject} ${mail.preview}`.toLowerCase();

      let key = "general";

      if (text.includes("meeting") || text.includes("call")) key = "meetings";
      else if (text.includes("invoice") || text.includes("payment")) key = "finance";
      else if (text.includes("project")) key = "projects";
      else if (text.includes("urgent")) key = "urgent";

      if (!foldersMap[key]) foldersMap[key] = [];
      foldersMap[key].push(mail);
    });

    return foldersMap;
  }

  function buildContexts(mails: ProcessedMail[]): Record<string, ProcessedMail[]> {
    const contexts: Record<string, ProcessedMail[]> = {};

    mails.forEach((mail) => {
      if (mail.securityLevel === "high_risk") return;

      const key = mail.sender || mail.project || mail.thread || "general";

      if (!contexts[key]) {
        contexts[key] = [];
      }

      contexts[key].push(mail);
    });

    return contexts;
  }

  function summarizeContext(context: ProcessedMail[]) {
    const intents = context.map((m) => m.intent);

    return {
      hasPayment: intents.includes("pay"),
      hasMeeting: intents.includes("schedule"),
      hasFollowUp: intents.includes("reply"),
      size: context.length,
    };
  }

  type ContextDecisionStep = {
    type: "schedule" | "pay" | "reply";
    action: string;
    reply: string;
  };

  function buildDecision(summary: ReturnType<typeof summarizeContext>): ContextDecisionStep[] {
    const steps: ContextDecisionStep[] = [];

    if (summary.hasMeeting) {
      steps.push({
        type: "schedule",
        action: "Confirm meeting",
        reply: "Confirmed. See you then.",
      });
    }

    if (summary.hasPayment) {
      steps.push({
        type: "pay",
        action: "Handle payment",
        reply: "Payment will be processed.",
      });
    }

    if (summary.hasFollowUp) {
      steps.push({
        type: "reply",
        action: "Send follow-up",
        reply: "Just following up on this.",
      });
    }

    return steps;
  }

  const [processedMails, setProcessedMails] = useState<ProcessedMail[]>(() => {
    const u = processMails([]);
    u.sort((a, b) => b.priorityScore - a.priorityScore);
    return u;
  });

  type MailAction = { label: string; value: string; primary?: boolean };

  function getActions(mail: ProcessedMail | null): MailAction[] {
    if (!mail) return [];

    if (mail.intent === "schedule") {
      return [
        { label: "Confirm", value: "confirm", primary: true },
        { label: "Reschedule", value: "reschedule" },
        { label: "Decline", value: "decline" },
      ];
    }

    if (mail.intent === "pay") {
      return [
        { label: "Pay", value: "pay", primary: true },
        { label: "Request invoice", value: "ask_invoice" },
        { label: "Later", value: "delay" },
      ];
    }

    if (mail.intent === "reply") {
      return [
        { label: "Quick reply", value: "reply", primary: true },
        { label: "Ask details", value: "clarify" },
      ];
    }

    return [{ label: "Read", value: "read", primary: true }];
  }

  function getSuggestions(mail: ProcessedMail | null): string[] {
    if (!mail) return [];

    const text = `${mail.subject} ${mail.content}`.toLowerCase();

    if (mail.intent === "schedule" || text.includes("meeting") || text.includes("calendar")) {
      return [
        "That time works for me — please send a calendar invite.",
        "I need to reschedule — could we try later this week?",
        "I'm not available then — can we find another slot?",
      ];
    }

    if (
      mail.intent === "pay" ||
      text.includes("invoice") ||
      text.includes("payment") ||
      text.includes("billing")
    ) {
      return [
        "Thanks — I'll review and complete payment shortly.",
        "Could you please resend the invoice or payment link?",
        "I need a bit more time — I'll confirm once I've processed this.",
      ];
    }

    if (mail.intent === "reply" || mail.intent === "follow_up") {
      return [
        "Thanks for the note — I'll follow up shortly with details.",
        "Got it — I'll review and get back to you with next steps.",
        "Acknowledged — is there anything specific you need from me?",
      ];
    }

    return [
      "Thanks for the update — I'll follow up shortly.",
      "Got it — I'll review and get back to you with next steps.",
      "Acknowledged — thanks for letting me know.",
    ];
  }

  function preloadMail(mail: ProcessedMail) {
    getActions(mail);
    getSuggestions(mail);
  }

  const triggerLinkThreatFlash = useCallback(() => {
    setLinkThreatFlash(true);
    window.setTimeout(() => setLinkThreatFlash(false), 420);
  }, []);

  function flushSelectMail(mail: ProcessedMail) {
    if (predictiveHoverTimerRef.current != null) {
      clearTimeout(predictiveHoverTimerRef.current);
      predictiveHoverTimerRef.current = null;
    }
    if (intentPreviewTimerRef.current != null) {
      clearTimeout(intentPreviewTimerRef.current);
      intentPreviewTimerRef.current = null;
    }
    setIntentPreviewMailId(null);
    pendingPredictiveMailRef.current = null;
    if (
      focusedClusterKeyRef.current &&
      mail.cluster !== focusedClusterKeyRef.current
    ) {
      return;
    }
    setSelectedMailId(mail.id);
    preloadMail(mail);
    setPredictiveWarmMailId(mail.id);
  }

  /** Demo: instant select — predictive hover debounce disabled (no delayed selection / intent preview). */
  function schedulePredictiveSelect(mail: ProcessedMail) {
    if (
      mail.id === selectedMailId &&
      predictiveWarmMailId === mail.id
    ) {
      return;
    }
    if (predictiveHoverTimerRef.current != null) {
      clearTimeout(predictiveHoverTimerRef.current);
      predictiveHoverTimerRef.current = null;
    }
    if (intentPreviewTimerRef.current != null) {
      clearTimeout(intentPreviewTimerRef.current);
      intentPreviewTimerRef.current = null;
    }
    setPredictiveWarmMailId(null);
    setIntentPreviewMailId(null);
    pendingPredictiveMailRef.current = mail.id;

    // Was: GOD_INTENT_PREVIEW_MS / GOD_PREDICTIVE_SELECT_MS — removed for instant demo behavior.
    // intentPreviewTimerRef.current = window.setTimeout(() => { ... }, GOD_INTENT_PREVIEW_MS);
    // predictiveHoverTimerRef.current = window.setTimeout(() => { ... }, GOD_PREDICTIVE_SELECT_MS);

    flushSelectMail(mail);
  }

  function cancelPendingPredictiveSelect() {
    if (predictiveHoverTimerRef.current != null) {
      clearTimeout(predictiveHoverTimerRef.current);
      predictiveHoverTimerRef.current = null;
    }
    if (intentPreviewTimerRef.current != null) {
      clearTimeout(intentPreviewTimerRef.current);
      intentPreviewTimerRef.current = null;
    }
    pendingPredictiveMailRef.current = null;
    setIntentPreviewMailId(null);
  }

  function detectAutoTone(mail: ProcessedMail | null): Tone {
    if (!mail) return "Professional";
    const t = `${mail.title} ${mail.subject} ${mail.preview} ${mail.content}`.toLowerCase();

    const formal = [
      "dear",
      "kindly",
      "sincerely",
      "regards",
      "availability",
      "please",
      "confirm",
      "regarding",
      "would you",
      "would you mind",
    ];
    const friendly = [
      "hey",
      "thanks",
      "thank you",
      "cheers",
      "let me know",
      "quick",
      "just",
      "appreciate",
      "no worries",
    ];

    const hasFormal = formal.some((k) => t.includes(k));
    const hasFriendly = friendly.some((k) => t.includes(k));

    // Only propose between Professional/Friendly (per requirement).
    if (hasFriendly && !hasFormal) return "Friendly";
    return "Professional";
  }

  function firstSentence(s: string) {
    const trimmed = s.trim();
    const match = trimmed.match(/^[^.!?]*[.!?]/);
    if (match) return match[0].trim();
    return trimmed;
  }

  function normalizeSeed(s: string) {
    return s
      .replace(/\s+/g, " ")
      .replace(/^hello[, ]+/i, "")
      .replace(/^hi[, ]+/i, "")
      .trim();
  }

  function extractContext(mail: ProcessedMail) {
    const body = `${mail.preview ?? ""} ${mail.content ?? ""}`;
    const lower = body.toLowerCase();
    return {
      sender: mail.sender ?? mail.title ?? "",
      hasLink: body.includes("http"),
      urgency: lower.includes("immediately") ? ("high" as const) : ("low" as const),
      requiresAction:
        lower.includes("confirm") || lower.includes("verify"),
    };
  }

  /** Single generator: keywords only — never copies the email into the reply. */
  function generateSmartReply(mail: ProcessedMail): string {
    const m = mail as ProcessedMail & { body?: string };
    const content = (m.content || m.body || "").toLowerCase();

    if (
      content.includes("verify") ||
      content.includes("password") ||
      content.includes("suspicious") ||
      content.includes("login")
    ) {
      return `Hello,

Thank you for the alert. I will review and secure my account immediately.

Best regards,
[Name]`;
    }

    if (
      content.includes("invoice") ||
      content.includes("meeting") ||
      content.includes("confirm")
    ) {
      return `Hello,

Thanks for your message. I will review and get back to you shortly.

Best regards,
[Name]`;
    }

    return `Hello,

Thanks for the update — noted.

Best regards,
[Name]`;
  }

  function generateDemoReplies(mail: ProcessedMail) {
    const text = (mail.subject + " " + (mail.content || "")).toLowerCase();

    if (text.includes("meeting") || text.includes("schedule")) {
      return [
        "That works for me. Please send a calendar invite.",
        "I'm available, let's confirm the timing.",
        "Can we slightly adjust the schedule?",
      ];
    }

    if (text.includes("invoice") || text.includes("payment")) {
      return [
        "Thanks, I'll review and process the payment shortly.",
        "Could you resend the invoice link please?",
        "I'll get back to you once this is handled.",
      ];
    }

    if (text.includes("urgent") || text.includes("asap")) {
      return [
        "Received. I'm on it and will update you shortly.",
        "Thanks for flagging, handling this now.",
        "Acknowledged. I'll prioritize this.",
      ];
    }

    return [
      "Thanks, I'll review and get back to you shortly.",
      "Got it. I'll follow up with next steps.",
      "Acknowledged, I'll take a look.",
    ];
  }

  function isGeneratedLetterReply(s: string): boolean {
    const t = (s || "").trim();
    return /^\s*Hello,/im.test(t) && /\[\s*Name\s*\]/m.test(t);
  }

  /** Full smart letters keep structure; short action seeds still get salutation wrappers. */
  function applyToneToSeed(seed: string, tone: Tone) {
    const raw = (seed || "").trim();
    if (!raw) return "";

    if (isGeneratedLetterReply(raw)) {
      if (tone === "Short" || tone === "Direct") {
        const inner = raw
          .replace(/^\s*Hello,?\s*/im, "")
          .replace(/\n\nBest regards,[\s\S]*$/im, "")
          .replace(/\n\nRegards,[\s\S]*$/im, "")
          .replace(/\n\nThanks,[\s\S]*$/im, "")
          .trim();
        return (firstSentence(inner) || inner).trim();
      }
      if (tone === "Friendly") {
        return raw
          .replace(/^\s*Hello,/im, "Hi!")
          .replace(/\n\nRegards,\s*\n\s*\[Name\]/im, "\n\nThanks,\n[Name]")
          .replace(/\n\nBest regards,\s*\n\s*\[Name\]/im, "\n\nThanks,\n[Name]");
      }
      return raw;
    }

    const core = normalizeSeed(raw);
    if (!core) return "";

    if (tone === "Short") return firstSentence(core);

    if (tone === "Direct") return firstSentence(core);

    if (tone === "Friendly") {
      return `Hi!\n\n${core}\n\nThanks,\n[Name]`;
    }

    return `Hello,\n\n${core}\n\nRegards,\n[Name]`;
  }

  function setReplyFromRawSeed(raw: string) {
    cancelReplyTyping();
    tonePreviewBackupRef.current = null;
    setHoveredTone(null);
    const text = (raw || "").trim();
    if (!text) {
      setBaseReply("");
      setAiReply("");
      setSuggestions([]);
      replyVariantSeedsRef.current = [];
      setSelectedSuggestionIndex(0);
      return;
    }

    if (isGeneratedLetterReply(text)) {
      replyVariantSeedsRef.current = [text];
      setSuggestions([text]);
      setSelectedSuggestionIndex(0);
      setBaseReply(text);
      setAiReply(text);
      return;
    }

    const seedPro = `${text} (professional and structured)`;
    replyVariantSeedsRef.current = [seedPro];
    const toned = applyToneToSeed(seedPro, committedTone);
    setSuggestions([toned]);
    setSelectedSuggestionIndex(0);
    setBaseReply(text);
    setAiReply(toned);
  }

  function getToneSeedText() {
    return aiReply.trim() || baseReply.trim();
  }

  function previewTone(tone: Tone) {
    if (!selectedMail) return;
    cancelReplyTyping();
    if (tonePreviewBackupRef.current == null) {
      tonePreviewBackupRef.current = aiReply;
    }
    setHoveredTone(tone);
    const seeds = replyVariantSeedsRef.current;
    const seed =
      seeds.length > 0
        ? seeds[Math.min(selectedSuggestionIndex, seeds.length - 1)]
        : baseReply || getToneSeedText();
    const nextText = applyToneToSeed(seed, tone);
    setAiReply(nextText);
  }

  function endTonePreview() {
    if (tonePreviewDelayTimerRef.current != null) {
      clearTimeout(tonePreviewDelayTimerRef.current);
      tonePreviewDelayTimerRef.current = null;
    }
    if (tonePreviewBackupRef.current != null) {
      setAiReply(tonePreviewBackupRef.current);
      tonePreviewBackupRef.current = null;
    }
    setHoveredTone(null);
  }

  function commitTone(tone: Tone) {
    cancelReplyTyping();
    tonePreviewBackupRef.current = null;
    setHoveredTone(null);
    setCommittedTone(tone);

    const seeds = replyVariantSeedsRef.current;
    if (seeds.length >= 1 && seeds.some((s) => s.trim())) {
      const updated = seeds.map((s) => applyToneToSeed(s, tone));
      setSuggestions(updated);
      setSelectedSuggestionIndex(0);
      setBaseReply(seeds[0]);
      setAiReply(updated[0]);
      return;
    }

    if (!baseReply) return;

    const updated = applyToneToSeed(baseReply, tone);
    setAiReply(updated);
  }

  function cancelReplyTyping() {
    if (replyTypingTimerRef.current != null) {
      clearTimeout(replyTypingTimerRef.current);
      replyTypingTimerRef.current = null;
    }
    if (aiSmartDelayTimerRef.current != null) {
      clearTimeout(aiSmartDelayTimerRef.current);
      aiSmartDelayTimerRef.current = null;
    }
    if (tonePreviewDelayTimerRef.current != null) {
      clearTimeout(tonePreviewDelayTimerRef.current);
      tonePreviewDelayTimerRef.current = null;
    }
  }

  /** Perceived “thinking” window for AI-driven UI (80–160ms) */
  function aiThinkDelayMs() {
    return 80 + Math.floor(Math.random() * 81);
  }

  function buildQuickActionSeed(
    action: "confirm" | "reschedule" | "decline",
    mail: ProcessedMail
  ) {
    if (mail.intent === "schedule") {
      if (action === "confirm") return "Confirmed. See you then.";
      if (action === "reschedule") return "Can we move to another time?";
      return "I won't be able to attend.";
    }

    if (mail.intent === "pay") {
      if (action === "confirm") return "Thanks — I will review and complete payment shortly.";
      if (action === "reschedule") return "Could you share an updated payment timeline?";
      return "I can't proceed right now — I'll get back with an update.";
    }

    if (mail.intent === "reply" || mail.intent === "follow_up") {
      if (action === "confirm") return "Got it — I'll move forward with next steps.";
      if (action === "reschedule") return "I might need a bit more time — I'll reply with an update soon.";
      return "Understood — I won't be able to commit right now.";
    }

    // default (read)
    if (action === "confirm") return "Noted — thank you.";
    if (action === "reschedule") return "Thanks — I'll follow up later with details.";
    return "Thanks — I’ll handle this when possible.";
  }

  function buildAskDetailsSeed(mail: ProcessedMail): string {
    if (mail.intent === "schedule") {
      return "Could you confirm the time zone, duration, and agenda (or share a calendar link)?";
    }
    if (mail.intent === "pay") {
      return "Could you please resend the invoice, amount due, and payment link?";
    }
    if (mail.intent === "reply" || mail.intent === "follow_up") {
      return "Could you clarify the priority and any deadlines you need from me?";
    }
    return "Could you share a bit more context so I can respond accurately?";
  }

  function getAiTag(intent: ProcessedMail["intent"]) {
    if (intent === "schedule") return "SCHEDULE";
    if (intent === "reply" || intent === "follow_up") return "REPLY";
    return "READ";
  }

  function mailDetectedContextLabel(
    mail: ProcessedMail
  ): "Meeting" | "Invoice" | "Support" {
    if (mail.intent === "schedule") return "Meeting";
    if (mail.intent === "pay") return "Invoice";
    return "Support";
  }

  function getUrgencyLabel(mail: Pick<ProcessedMail, "priority">) {
    const p = mail.priority ?? "low";
    if (p === "urgent") return "High priority";
    if (p === "medium") return "Medium priority";
    return "Low priority";
  }

  function getActionClarityLabel(
    mail: Pick<ProcessedMail, "needsReply" | "intentConfidence">
  ) {
    const c = mail.intentConfidence ?? 0;
    const clear = c >= 0.8;
    if (mail.needsReply) {
      return clear ? "Reply recommended" : "Unclear intent";
    }
    return clear ? "No reply needed" : "Unclear intent";
  }

  /** Line 2 under action tag + score (urgency — clarity). */
  function getMailActionLine2(mail: ProcessedMail) {
    const u = getUrgencyLabel(mail);
    let detail = getActionClarityLabel(mail);
    if (
      (mail.priority ?? "low") === "low" &&
      !mail.needsReply &&
      (mail.intentConfidence ?? 0) >= 0.8
    ) {
      detail = "No rush";
    }
    return `${u} — ${detail}`;
  }

  /** One short line for native tooltip (hover) — friendly, not the full reason. */
  function getMailActionTooltip(mail: ProcessedMail): string {
    const level = mail.securityLevel;
    const reason = (mail.securityReason ?? "").toLowerCase();
    const bullets = mail.securityWhyBullets.join(" ").toLowerCase();

    if (level === "high_risk") {
      if (/brand|impersonat/i.test(reason)) return "Brand impersonation risk";
      if (/phish|credential|malware/i.test(reason + bullets))
        return "Possible phishing";
      return "High risk — review carefully";
    }

    if (level === "suspicious") {
      if (
        /domain|sender|spf|dkim|dmarc|link|host/i.test(reason + bullets)
      ) {
        return "Suspicious domain detected";
      }
      if (
        /urgent|payment|invoice|pressure|content/i.test(reason + bullets)
      ) {
        return "Urgent tone detected";
      }
      return "Worth a second look";
    }

    if (!mail.needsReply) return "No reply needed";
    return "Looks safe";
  }

  function closeAiInsightPanel() {
    setAiInsightPanelMailId(null);
  }

  function openAiInsightPanel(mail: ProcessedMail) {
    setAiInsightPanelMailId(mail.id);
  }

  function applyQuickAction(action: "confirm" | "reschedule" | "decline") {
    if (!selectedMail) return;
    const seed = buildQuickActionSeed(action, selectedMail);
    setReplyFromRawSeed(seed);
  }

  useEffect(() => {
    const updated = processMails(mails);
    updated.sort((a, b) => b.priorityScore - a.priorityScore);
    setProcessedMails(updated);
    setSmartFolders(generateSmartFolders(updated));
    setMailContexts(buildContexts(updated));
  }, [mails]);

  useEffect(() => {
    if (!selectedMailId || !mailsHydrated) return;
    markMailRead(selectedMailId);
  }, [selectedMailId, mailsHydrated, markMailRead]);

  useEffect(() => {
    return () => cancelReplyTyping();
  }, []);

  useEffect(() => {
    if (!aiInsightPanelMailId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAiInsightPanelMailId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiInsightPanelMailId]);

  useEffect(() => {
    return () => {
      if (predictiveHoverTimerRef.current != null) {
        clearTimeout(predictiveHoverTimerRef.current);
      }
      if (intentPreviewTimerRef.current != null) {
        clearTimeout(intentPreviewTimerRef.current);
      }
      if (idleTimerRef.current != null) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsThemeTransitioning(true);
    const timer = window.setTimeout(() => {
      setIsThemeTransitioning(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [themeMode]);

  useEffect(() => {
    const body = document.body;
    const legacyTheme =
      themeMode === "aether"
        ? "purple"
        : themeMode === "orbital"
          ? "orbital"
          : themeMode === "ember"
            ? "forge"
            : themeMode === "nova"
              ? "nova"
              : themeMode === "blacken"
                ? "blacken"
                : themeMode === "voidbeast"
                  ? "voidbeast"
                  : "carbonite";
    body.setAttribute("data-theme", legacyTheme);
    return () => {
      body.removeAttribute("data-theme");
    };
  }, [themeMode]);

  /** Smoothed pointer + parallax CSS vars (lerp, no jitter) */
  useEffect(() => {
    if (!bootDone) return;

    if (!appLayoutRef.current) return;
    if (!backgroundEffectsRef.current) return;
    const modalLocked =
      accountModalOpen ||
      settingsModalOpen ||
      composeModalOpen ||
      featureWipModal != null;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyNeutral = () => {
      const layout = appLayoutRef.current;
      const bg = backgroundEffectsRef.current;
      if (!layout) return;
      layout.style.setProperty("--ptr-x", "0.5");
      layout.style.setProperty("--ptr-y", "0.5");
      layout.style.setProperty("--parallax-x", "0");
      layout.style.setProperty("--parallax-y", "0");
      if (!bg) return;
      bg.style.setProperty("--bg-ptr-x", "0.5");
      bg.style.setProperty("--bg-ptr-y", "0.5");
      bg.style.setProperty("--bg-parallax-x", "0");
      bg.style.setProperty("--bg-parallax-y", "0");
    };
    if (reduceMotion.matches || modalLocked) {
      applyNeutral();
      return;
    }

    const target = { x: 0.5, y: 0.5 };
    const smooth = { x: 0.5, y: 0.5 };
    const LERP = 0.062;

    const onMove = (e: MouseEvent) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      target.x = e.clientX / w;
      target.y = e.clientY / h;
    };

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (reduceMotion.matches) {
        applyNeutral();
        return;
      }
      smooth.x += (target.x - smooth.x) * LERP;
      smooth.y += (target.y - smooth.y) * LERP;
      const layout = appLayoutRef.current;
      const bg = backgroundEffectsRef.current;
      if (!layout || !bg) return;
      const px = (smooth.x - 0.5) * 2;
      const py = (smooth.y - 0.5) * 2;
      // Keep UI layer static; pointer-driven motion belongs to background-only layer.
      layout.style.setProperty("--ptr-x", "0.5");
      layout.style.setProperty("--ptr-y", "0.5");
      layout.style.setProperty("--parallax-x", "0");
      layout.style.setProperty("--parallax-y", "0");
      bg.style.setProperty("--bg-ptr-x", smooth.x.toFixed(6));
      bg.style.setProperty("--bg-ptr-y", smooth.y.toFixed(6));
      bg.style.setProperty("--bg-parallax-x", px.toFixed(6));
      bg.style.setProperty("--bg-parallax-y", py.toFixed(6));
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    const onReduce = () => {
      if (reduceMotion.matches) applyNeutral();
    };
    reduceMotion.addEventListener("change", onReduce);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      reduceMotion.removeEventListener("change", onReduce);
    };
  }, [bootDone, accountModalOpen, settingsModalOpen, composeModalOpen]);

  /** Magnetic hover (max 6px) + pointer coordinates for liquid light */
  useEffect(() => {
    if (!bootDone) return;
    const root = appLayoutRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const MAX = 6;
    let lastMagnetic: HTMLElement | null = null;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.setProperty("--mx", "0px");
      el.style.setProperty("--my", "0px");
      el.style.setProperty("--mx-raw", "50%");
      el.style.setProperty("--my-raw", "50%");
    };

    const onMove = (e: MouseEvent) => {
      if (reduceMotion.matches) {
        clear(lastMagnetic);
        lastMagnetic = null;
        return;
      }

      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit?.closest(".magnetic-ui") as HTMLElement | null;
      const magnetic = el && root.contains(el) ? el : null;

      if (lastMagnetic && lastMagnetic !== magnetic) {
        clear(lastMagnetic);
      }
      lastMagnetic = magnetic;

      if (!magnetic) return;

      const rect = magnetic.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const hx = Math.max(rect.width / 2, 1);
      const hy = Math.max(rect.height / 2, 1);
      const mx = clamp((dx / hx) * MAX, -MAX, MAX);
      const my = clamp((dy / hy) * MAX, -MAX, MAX);
      magnetic.style.setProperty("--mx", `${mx}px`);
      magnetic.style.setProperty("--my", `${my}px`);
      magnetic.style.setProperty("--mx-raw", `${localX}px`);
      magnetic.style.setProperty("--my-raw", `${localY}px`);
    };

    const onLeaveRoot = () => {
      clear(lastMagnetic);
      lastMagnetic = null;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    root.addEventListener("mouseleave", onLeaveRoot);

    const onReduce = () => {
      if (reduceMotion.matches) {
        clear(lastMagnetic);
        lastMagnetic = null;
      }
    };
    reduceMotion.addEventListener("change", onReduce);

    return () => {
      window.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeaveRoot);
      reduceMotion.removeEventListener("change", onReduce);
      clear(lastMagnetic);
    };
  }, [bootDone]);

  /** BLACKEN global liquid reflection pointer */
  useEffect(() => {
    const modalLocked =
      accountModalOpen ||
      settingsModalOpen ||
      composeModalOpen ||
      featureWipModal != null;
    const bg = backgroundEffectsRef.current;
    if (!bg) return;
    if (modalLocked) {
      bg.style.setProperty("--mouse-x", "50%");
      bg.style.setProperty("--mouse-y", "50%");
      return;
    }
    const onMove = (event: MouseEvent) => {
      const x = `${(event.clientX / window.innerWidth) * 100}%`;
      const y = `${(event.clientY / window.innerHeight) * 100}%`;
      bg.style.setProperty("--mouse-x", x);
      bg.style.setProperty("--mouse-y", y);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      bg.style.setProperty("--mouse-x", "50%");
      bg.style.setProperty("--mouse-y", "50%");
    };
  }, [accountModalOpen, settingsModalOpen, composeModalOpen]);

  // Flow now uses stack layout (no continuous physics loop).

  /** High-risk mail is quarantine-only, except demo seeds flagged to stay in inbox. */
  const nonQuarantineMails = useMemo(
    () =>
      processedMails.filter((m) => {
        if (m.securityLevel !== "high_risk") return true;
        if (OPENMAIL_DEMO_MODE && m.demoAlwaysShowInInbox) return true;
        return false;
      }),
    [processedMails]
  );

  const quarantineCount = processedMails.length - nonQuarantineMails.length;

  /** Mails visible for the current folder: inbox-style views exclude quarantine; quarantine shows only high-risk. */
  const viewMailPool = useMemo(() => {
    if (activeFilter === "quarantine") {
      return processedMails.filter((m) => m.securityLevel === "high_risk");
    }
    return nonQuarantineMails;
  }, [processedMails, activeFilter, nonQuarantineMails]);

  const activeContext = useMemo(() => {
    const contexts = buildContexts(nonQuarantineMails);
    return Object.values(contexts).sort((a, b) => b.length - a.length)[0] ?? null;
  }, [nonQuarantineMails]);

  const contextSummary = useMemo(
    () => summarizeContext(activeContext ?? []),
    [activeContext]
  );

  const decisionSteps = buildDecision(
    (contextSummary || {}) as ReturnType<typeof summarizeContext>
  );

  const hasDecision = decisionSteps && decisionSteps.length > 0;

  const insightMails = useMemo(() => {
    const src =
      activeContext && activeContext.length > 0 ? activeContext : nonQuarantineMails;
    return [...src]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 4);
  }, [activeContext, nonQuarantineMails]);
  const [aiImpactPreview, setAiImpactPreview] = useState<string | null>(null);
  const [actionFeedbackType, setActionFeedbackType] = useState<
    "clear" | "resolved" | "scheduled" | null
  >(null);
  const actionFeedbackTypeRef = useRef<"clear" | "resolved" | "scheduled" | null>(
    actionFeedbackType
  );
  actionFeedbackTypeRef.current = actionFeedbackType;
  const [mailFeedback, setMailFeedback] = useState<
    Record<string, "clear" | "resolved" | "scheduled">
  >({});

  const [linkDefenseToast, setLinkDefenseToast] = useState<string | null>(null);

  useEffect(() => {
    if (!linkDefenseToast) return;
    const t = window.setTimeout(() => setLinkDefenseToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [linkDefenseToast]);

  const handleQuarantineFromLink = useCallback(
    (id: string) => {
      // Defer state writes to avoid render-phase updates if callback is invoked synchronously.
      queueMicrotask(() => {
        const next = processedMails.map((m) =>
          m.id === id
            ? {
                ...m,
                securityLevel: "high_risk" as const,
                securityReason: "Malicious link blocked — AI quarantine",
                securityAiSubline: "",
                securityWhyBullets: [
                  "Outbound link blocked before connection",
                  "Message moved to Quarantine",
                  "SOC notified (simulated)",
                ],
              }
            : m
        );
        setProcessedMails(next);
        if (selectedMailId === id) {
          const replacement = next.find((m) => m.securityLevel !== "high_risk")?.id;
          if (replacement) setSelectedMailId(replacement);
        }
        setOpenedMail((m) => (m?.id === id ? null : m));
        setAiInsightPanelMailId((mid) => (mid === id ? null : mid));
        setLinkDefenseToast("AI action executed — message isolated to Quarantine");
        setActiveFilter("quarantine");
      });
    },
    [processedMails, selectedMailId, setSelectedMailId]
  );

  const inboxHealth = (() => {
    const total = nonQuarantineMails.length;
    const urgent = nonQuarantineMails.filter((m) => m.cluster === "urgent").length;
    const hot = nonQuarantineMails.filter((m) => m.attentionScore > 92).length;
    if (urgent >= 2 || hot >= 3) return "overload";
    if (total > 4 || urgent > 0 || hot > 0) return "busy";
    return "calm";
  })();

  const inboxHealthLabel =
    inboxHealth === "overload"
      ? "3 emails need attention"
      : inboxHealth === "busy"
        ? "1 urgent"
        : "All clear";

  const controlActions = (() => {
    if (focusedClusterKey === "meeting") {
      return ["Schedule", "Reply", "Delegate", "Archive"];
    }
    if (focusedClusterKey === "money") {
      return ["Reply", "Delegate", "Archive", "Schedule"];
    }
    if (focusedClusterKey === "urgent") {
      return ["Reply", "Delegate", "Schedule", "Archive"];
    }
    return ["Reply", "Archive", "Schedule", "Delegate"];
  })();

  const aiSuggestionScope = focusedClusterKey
    ? nonQuarantineMails.filter((m) => m.cluster === focusedClusterKey)
    : nonQuarantineMails;

  function triggerActionFeedback(
    ids: string[],
    kind: "clear" | "resolved" | "scheduled",
    commit: () => void
  ) {
    if (ids.length === 0) {
      commit();
      return;
    }

    setActionFeedbackType(kind);
    setMailFeedback((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = kind;
      });
      return next;
    });

    window.setTimeout(() => {
      commit();
      setMailFeedback((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setActionFeedbackType(null);
    }, 420);
  }

  type AISuggestion = {
    key: string;
    label: string;
    preview: string;
    run: () => void;
    impact: number;
  };

  const aiSuggestions = (() => {
    const urgentReplyCount = aiSuggestionScope.filter(
      (m) => m.cluster === "urgent" && m.needsReply
    ).length;
    const meetingCount = aiSuggestionScope.filter((m) => m.intent === "schedule").length;
    const lowPriorityCount = aiSuggestionScope.filter(
      (m) => m.cluster === "other" && m.attentionScore < 91
    ).length;

    const avgAttention =
      aiSuggestionScope.length > 0
        ? aiSuggestionScope.reduce((acc, m) => acc + m.attentionScore, 0) /
          aiSuggestionScope.length
        : 0;
    const scopeVolume = aiSuggestionScope.length;
    const suggestions: AISuggestion[] = [];

    if (focusedClusterKey === "meeting") {
      suggestions.push({
        key: "schedule-meetings",
        label: `Schedule ${meetingCount} meetings`,
        preview: "Sort by date and prioritize pending meeting invites.",
        run: () => {
          const ids = aiSuggestionScope.filter((m) => m.intent === "schedule").map((m) => m.id);
          triggerActionFeedback(ids, "scheduled", () => {
            setMails((prev) => {
              const targets = prev.filter((m) => ids.includes(m.id) && m.x != null && m.y != null);
              if (targets.length === 0) return prev;
              const cx =
                targets.reduce((acc, m) => acc + (m.x ?? 50), 0) / targets.length;
              const cy =
                targets.reduce((acc, m) => acc + (m.y ?? 50), 0) / targets.length;
              return prev.map((m) => {
                if (!ids.includes(m.id)) return m;
                const mx = m.x ?? 50;
                const my = m.y ?? 50;
                return {
                  ...m,
                  scheduled: true,
                  x: Math.max(10, Math.min(90, mx + (cx - mx) * 0.25)),
                  y: Math.max(10, Math.min(90, my + (cy - my) * 0.25)),
                };
              });
            });
            setSortMode("date");
            setManualMode(true);
            setDisplayMode("flow");
          });
        },
        impact: meetingCount * 3 + avgAttention * 1.2 + scopeVolume * 0.6,
      });
      suggestions.push({
        key: "reply-invites",
        label: "Reply to pending invites",
        preview: "Targets the next invite and fills a quick confirmation draft.",
        run: () => {
          setSelectedMailId(
            aiSuggestionScope.find((m) => m.intent === "schedule" && m.needsReply)?.id ?? ""
          );
          setReplyFromRawSeed(
            "Confirming this invite — sending availability now."
          );
        },
        impact:
          aiSuggestionScope.filter((m) => m.intent === "schedule" && m.needsReply).length * 3.2 +
          avgAttention,
      });
      suggestions.push({
        key: "clear-low",
        label: `Clear ${Math.max(0, lowPriorityCount)} low priority emails`,
        preview: "Keeps only high-attention or non-other cluster emails.",
        run: () => {
          setMails((prev) =>
            prev.filter((m) => (m.priority ?? "low") === "urgent" || m.confidence > 90)
          );
        },
        impact: lowPriorityCount * 2 + scopeVolume * 0.4,
      });
      return suggestions.sort((a, b) => b.impact - a.impact).slice(0, 3);
    }

    suggestions.push({
      key: "urgent-replies",
      label: `${urgentReplyCount} urgent emails need reply`,
      preview: "Brings urgent pending replies to the top with flow focus.",
      run: () => {
        const ids = aiSuggestionScope
          .filter((m) => m.cluster === "urgent" && m.needsReply)
          .map((m) => m.id);
        triggerActionFeedback(ids, "resolved", () => {
          setMails((prev) =>
            prev.map((m) =>
              ids.includes(m.id)
                ? {
                    ...m,
                    needsReply: false,
                    resolved: true,
                  }
                : m
            )
          );
          setActiveFilter("follow_ups");
          setSortMode("importance");
          setManualMode(true);
          setDisplayMode("flow");
        });
      },
      impact: urgentReplyCount * 4 + avgAttention * 1.3 + scopeVolume * 0.7,
    });
    suggestions.push({
      key: "meetings-to-schedule",
      label: `${meetingCount} meetings to schedule`,
      preview: "Focuses scheduling intent and surfaces calendar-related threads.",
      run: () => {
        setFocusedClusterKey("meeting");
        setManualMode(true);
        setDisplayMode("flow");
      },
      impact: meetingCount * 2.8 + avgAttention * 1.05 + scopeVolume * 0.5,
    });
    suggestions.push({
      key: "clear-low",
      label: `Clear ${Math.max(0, lowPriorityCount)} low priority emails`,
      preview: "Removes low-priority noise from the current inbox set.",
      run: () => {
        const ids = aiSuggestionScope
          .filter((m) => m.cluster === "other" && m.attentionScore < 91)
          .map((m) => m.id);
        triggerActionFeedback(ids, "clear", () => {
          setMails((prev) => prev.filter((m) => !ids.includes(m.id)));
        });
      },
      impact: lowPriorityCount * 2.2 + scopeVolume * 0.4,
    });
    return suggestions.sort((a, b) => b.impact - a.impact).slice(0, 3);
  })();
  const primaryIntent = aiSuggestions[0] ?? null;

  function handleControlAction(action: string) {
    if (!selectedMail) return;
    if (action === "Reply") {
      handleAction("reply");
      return;
    }
    if (action === "Archive") {
      softDeleteMail(selectedMail.id);
      return;
    }
    if (action === "Schedule") {
      handleAction("schedule");
      return;
    }
    if (action === "Delegate") {
      setReplyFromRawSeed("Delegating this thread to the right owner.");
    }
  }

  function handleMenuAction(
    action: "inbox" | "drafts" | "sync" | "settings" | "contacts"
  ) {
    setMenuActiveAction(action);
    if (action === "inbox") {
      handleFolderChange("inbox");
      return;
    }
    if (action === "drafts") {
      handleFolderChange("drafts");
      return;
    }
    if (action === "sync") {
      void syncFromImap();
      return;
    }
    if (action === "settings") {
      setSettingsModalOpen(true);
      return;
    }
  }

  function isMenuActionActive(
    action: "inbox" | "drafts" | "sync" | "settings" | "contacts"
  ): boolean {
    if (action === "inbox") return activeFilter === "inbox";
    if (action === "drafts") return activeFilter === "drafts";
    if (action === "sync") return isSyncing;
    if (action === "settings") return settingsModalOpen;
    return menuActiveAction === action;
  }

  async function handleComposeSend() {
    const to = composeTo.trim();
    if (!to.includes("@")) {
      return;
    }
    if (!OPENMAIL_DEMO_MODE && !storedAccount) {
      return;
    }
    setComposeSending(true);
    try {
      if (!OPENMAIL_DEMO_MODE) {
        const res = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account: storedAccount!,
            to,
            subject: composeSubject.trim() || "(no subject)",
            text: composeBody || " ",
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Send failed");
      }
      const sentLocal: MailItem = {
        id: `sent-compose-${Date.now()}`,
        folder: "sent",
        read: true,
        title: "You",
        sender: storedAccount?.email.trim() || "you@openmail.demo",
        subject: composeSubject.trim() || "(no subject)",
        preview: (composeBody.trim() || "(empty)").slice(0, 140),
        content: composeBody.trim() || "(empty)",
        aiPreview: "Sent message",
        confidence: 70,
        needsReply: false,
        deleted: false,
        date: new Date().toISOString(),
        x: 48,
        y: 42,
      };
      setMails((prev) => [sentLocal, ...prev]);
      setComposeModalOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    } catch {
      /* compose errors stay in-modal; do not overwrite AI Reply */
    } finally {
      setComposeSending(false);
    }
  }

  const handleFolderChange = useCallback((folder: string) => {
    setActiveFilter(folder === "trash" ? "delete" : folder);
  }, []);

  const getMails = useCallback(
    async (folder: "inbox" | "sent" | "drafts") => {
      if (!storedAccount) return;
      if (!isAccountConfigured(storedAccount)) {
        console.log(
          "[openmail] getMails skipped: account present but not fully configured"
        );
        return;
      }
      setFolderLoading(true);
      try {
        const res = await fetch(`/api/mail/get-mails?folder=${encodeURIComponent(folder)}`, {
          headers: {
            "Content-Type": "application/json",
            "x-openmail-account": JSON.stringify(storedAccount),
          },
        });
        const data = (await res.json()) as { messages?: MailItem[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Sync failed");
        const incoming = data.messages ?? [];
        setMails((prev) => {
          const rest = prev.filter((m) => m.folder !== folder);
          return [...rest, ...incoming];
        });
      } catch {
        /* folder load errors: do not overwrite AI Reply */
      } finally {
        setFolderLoading(false);
      }
    },
    [storedAccount, setMails]
  );

  useEffect(() => {
    if (OPENMAIL_DEMO_MODE) return;
    if (activeFilter === "inbox" || activeFilter === "sent" || activeFilter === "drafts") {
      void getMails(activeFilter);
    }
  }, [activeFilter, getMails]);

  function handleComposeSaveDraft() {
    const trimmedTo = composeTo.trim();
    const trimmedSubject = composeSubject.trim() || "(draft)";
    const trimmedBody = composeBody.trim();
    const draft: MailItem = {
      id: `draft-${Date.now()}`,
      folder: "drafts",
      read: true,
      title: trimmedTo || "Draft recipient",
      sender: storedAccount?.email?.trim() || "local@openmail",
      subject: trimmedSubject,
      preview: trimmedBody.slice(0, 120) || "Draft saved",
      content: trimmedBody || "(empty draft)",
      aiPreview: "Draft message",
      confidence: 50,
      needsReply: false,
      deleted: false,
      date: new Date().toISOString(),
      x: 45,
      y: 35,
    };
    setMails((prev) => prev.concat(draft));
    setComposeModalOpen(false);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setActiveFilter("drafts");
  }

  function openReplyCompose(mail: ProcessedMail) {
    const to = (mail.sender ?? "").trim();
    const subject = mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`;
    const dateLabel = mail.date ? new Date(mail.date).toLocaleString() : "";
    const quoted = [
      "",
      "",
      "--- Original message ---",
      `From: ${mail.sender ?? mail.title}`,
      dateLabel ? `Date: ${dateLabel}` : "",
      `Subject: ${mail.subject}`,
      "",
      mail.content ?? mail.preview ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    setComposeTo(to);
    setComposeSubject(subject);
    setComposeBody(quoted);
    setComposeModalOpen(true);
  }

  async function connectAccount(mode: "auto" | "manual") {
    if (!setupEmail.trim() || !setupPassword) {
      setAccountConnectError("Enter your email and password.");
      return;
    }

    setAccountConnectError("");
    setAccountConnectStep("loading");
    setAccountConnectHint("Detecting provider...");

    try {
      const payload =
        mode === "manual"
          ? {
              mode,
              email: setupEmail.trim(),
              password: setupPassword,
              manual: accountDraft,
            }
          : {
              mode,
              email: setupEmail.trim(),
              password: setupPassword,
            };

      const stageTimer = window.setTimeout(
        () => setAccountConnectHint("Connecting securely..."),
        650
      );

      const res = await fetch("/api/mail/connect-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      window.clearTimeout(stageTimer);

      const data = (await res.json()) as { account?: OpenMailAccountProfile; error?: string };
      if (!res.ok || !data.account) {
        throw new Error(data.error || "Connection failed");
      }

      saveAccount(data.account);
      setAccountModalOpen(false);
      await syncFromImap();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not connect automatically. Enter manual settings.";
      setAccountConnectError(message);
      setAccountConnectHint("");
      setAccountConnectStep("manual");
    }
  }

  function handleCoreFeature(feature: "ai" | "context" | "actions") {
    if (feature === "ai") {
      setAiAssistEnabled((prev) => !prev);
      return;
    }
    if (feature === "context") {
      setContextSource((prev) =>
        prev === "mail" ? "thread" : prev === "thread" ? "global" : "mail"
      );
      return;
    }
    setSmartActionsEnabled((prev) => !prev);
  }

  function runAICoreCommand(command: string) {
    const c = command.trim().toLowerCase();
    if (!c) return;
    if (c.includes("attention")) {
      setSortMode("importance");
      setManualMode(true);
      setDisplayMode("flow");
      return;
    }
    if (c.includes("summarize")) {
      return;
    }
    if (c.includes("clear") && c.includes("low")) {
      setMails((prev) => prev.filter((m) => m.priority === "urgent" || m.confidence > 90));
    }
  }

  function previewInsight() {
    // Optional preview only — user must click; never auto-run.
    const primary = activeContext?.[0] ?? nonQuarantineMails[0];
    if (primary) {
      flushSync(() => {
        setSelectedMailId(primary.id);
      });
    }

    const first = decisionSteps[0];
    if (first) {
      setReplyFromRawSeed(first.reply);
      return;
    }
    if (primary) {
      const soft = getSuggestions(primary)[0];
      if (soft) setReplyFromRawSeed(soft);
    }
  }

  function handleFocusMouseMove(event: ReactMouseEvent<HTMLElement>) {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    el.style.setProperty("--mouse-x", `${x}px`);
    el.style.setProperty("--mouse-y", `${y}px`);
  }

  function handleFocusMouseLeave(event: ReactMouseEvent<HTMLElement>) {
    const el = event.currentTarget;
    el.style.setProperty("--mouse-x", "50%");
    el.style.setProperty("--mouse-y", "50%");
  }

  function handleMailCardSheenMove(event: ReactMouseEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    el.style.setProperty("--sheen-nx", nx.toFixed(4));
    el.style.setProperty("--sheen-ny", ny.toFixed(4));
  }

  function resetMailCardSheen(el: HTMLDivElement) {
    el.style.setProperty("--sheen-nx", "0");
    el.style.setProperty("--sheen-ny", "0");
  }

  function executeDecision() {
    if (!hasDecision) return;

    const primary = activeContext?.[0];
    if (primary) {
      flushSync(() => {
        setSelectedMailId(primary.id);
      });
    }

    let i = 0;

    function runNext() {
      if (i >= decisionSteps.length) return;

      const step = decisionSteps[i];

      setReplyFromRawSeed(step.reply);

      setTimeout(() => {
        handleActionRef.current(step.type);
        i++;
        runNext();
      }, 0);
    }

    runNext();
  }

  let filteredMails = viewMailPool;

  if (activeFilter === "ai_flagged") {
    filteredMails = viewMailPool.filter((mail) => mail.priorityScore > 50);
  } else if (activeFilter === "follow_ups") {
    filteredMails = viewMailPool.filter((mail) => mail.needsReply);
  } else if (activeFilter === "delete") {
    filteredMails = viewMailPool.filter((mail) => mail.deleted);
  } else if (activeFilter === "inbox") {
    filteredMails = viewMailPool.filter(
      (m) => m.folder === "inbox" && !m.deleted
    );
  } else if (activeFilter === "sent") {
    filteredMails = viewMailPool.filter(
      (m) => m.folder === "sent" && !m.deleted
    );
  } else if (activeFilter === "drafts") {
    filteredMails = viewMailPool.filter(
      (m) => m.folder === "drafts" && !m.deleted
    );
  }

  if (smartFolders[activeFilter]) {
    filteredMails = smartFolders[activeFilter].filter(
      (m) => m.securityLevel !== "high_risk"
    );
  }
  if (mailContexts[activeFilter]) {
    filteredMails = mailContexts[activeFilter].filter(
      (m) => m.securityLevel !== "high_risk"
    );
  }

  const sortedMails = [...filteredMails].sort((a, b) =>
    compareMailItems(a, b, sortMode)
  );
  sortedMailsRef.current = sortedMails;

  const networkMailOrderKey = sortedMails.map((m) => m.id).join();

  const flowClusters = useMemo(() => {
    const map = new Map<string, ProcessedMail[]>();
    for (const m of sortedMails) {
      const key = `${m.cluster}|${m.thread ?? m.sender ?? m.project ?? "general"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.priorityScore - a.priorityScore);
    }
    return [...map.entries()]
      .map(([key, mails]) => ({ key, mails }))
      .sort((a, b) => {
        const maxA = Math.max(...a.mails.map((m) => m.priorityScore), 0);
        const maxB = Math.max(...b.mails.map((m) => m.priorityScore), 0);
        if (maxB !== maxA) return maxB - maxA;
        return b.mails.length - a.mails.length;
      });
  }, [sortedMails]);

  const flowStreamRows = useMemo((): InboxListRow[] => {
    const rows: InboxListRow[] = [];
    for (const g of flowClusters) {
      if (g.mails.length === 1) {
        const m = g.mails[0];
        rows.push({
          type: "mail",
          mail: m,
          flowTier: flowVisualTier(m),
        });
      } else {
        const [leader, ...followers] = g.mails;
        rows.push({
          type: "flow-group",
          clusterKey: g.key,
          title: flowGroupTitle(g.mails),
          total: g.mails.length,
          leader,
          followers,
          leaderTier: flowVisualTier(leader),
        });
      }
    }
    return rows;
  }, [flowClusters]);

  useLayoutEffect(() => {
    if (displayMode !== "flow") return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const slots = flowSlotRefs.current;
    const ids = sortedMails.map((m) => m.id);
    const tops: Record<string, number> = {};
    for (const id of ids) {
      const el = slots[id];
      if (!el) continue;
      const { top, height } = el.getBoundingClientRect();
      if (height < 4) continue;
      tops[id] = top;
    }

    const prev = prevFlowSlotTops.current;
    const deltas: Record<string, number> = {};
    if (Object.keys(prev).length > 0) {
      for (const id of ids) {
        if (prev[id] == null || tops[id] == null) continue;
        const dy = prev[id]! - tops[id]!;
        if (Math.abs(dy) > 1.5) deltas[id] = dy;
      }
    }
    prevFlowSlotTops.current = tops;

    const animated: HTMLElement[] = [];
    for (const [id, dy] of Object.entries(deltas)) {
      const el = slots[id];
      if (!el) continue;
      el.classList.remove("flow-mail-slot--play");
      el.style.setProperty("--flow-dy", `${dy}px`);
      animated.push(el);
    }
    if (animated.length === 0) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const el of animated) {
          el.classList.add("flow-mail-slot--play");
        }
        window.setTimeout(() => {
          for (const el of animated) {
            el.classList.remove("flow-mail-slot--play");
            el.style.removeProperty("--flow-dy");
          }
        }, 240);
      });
    });
  }, [networkMailOrderKey, displayMode, sortedMails]);

  const inboxListRows: InboxListRow[] = useMemo(() => {
    if (displayMode === "flow") return flowStreamRows;
    return sortedMails.map((mail) => ({ type: "mail" as const, mail }));
  }, [displayMode, flowStreamRows, sortedMails]);

  useEffect(() => {
    const stillVisible = sortedMails.some((m) => m.id === selectedMailId);
    if (!stillVisible && selectedMailId) {
      setSelectedMailId("");
    }
  }, [activeFilter, selectedMailId, networkMailOrderKey, setSelectedMailId]);

  const focusMail =
    viewMailPool.length === 0
      ? null
      : viewMailPool.reduce((max, m) =>
          getAttentionScore(m) > getAttentionScore(max) ? m : max,
        viewMailPool[0]);

  const clusterLeaders = useMemo(() => {
    const map: Partial<Record<ProcessedMail["cluster"], ProcessedMail>> = {};

    for (const m of viewMailPool) {
      const key = m.cluster;
      if (!map[key] || m.attentionScore > map[key]!.attentionScore) {
        map[key] = m;
      }
    }

    return map as Record<ProcessedMail["cluster"], ProcessedMail>;
  }, [viewMailPool]);

  const focusedLeader = focusedClusterKey ? clusterLeaders[focusedClusterKey] : null;
  const hoveredClusterKey =
    hoveredMailId != null
      ? sortedMails.find((m) => m.id === hoveredMailId)?.cluster ?? null
      : null;
  const smartFocusClusterKey = focusedClusterKey ?? hoveredClusterKey;

  const selectedMailById =
    sortedMails.find((mail) => mail.id === selectedMailId) ?? null;

  const selectedMail = (() => {
    if (!focusedClusterKey) return selectedMailById;

    if (selectedMailById?.cluster === focusedClusterKey) {
      return selectedMailById;
    }

    return null;
  })();

  const prevMailIdForIntentRef = useRef<string | null>(null);

  useEffect(() => {
    const mailSwitched =
      prevMailIdForIntentRef.current !== null &&
      prevMailIdForIntentRef.current !== selectedMailId;
    prevMailIdForIntentRef.current = selectedMailId;

    if (mailSwitched) {
      setReplyIntent("");
      setReplyOptionalDraft("");
      setShowWhyThisReply(false);
    }
  }, [selectedMailId]);

  /** Demo replies: three fixed strings from subject/content keywords only — never paste mail body as the reply. */
  useEffect(() => {
    if (!selectedMail) {
      setBaseReply("");
      setAiReply("");
      setSuggestions([]);
      replyVariantSeedsRef.current = [];
      setSelectedSuggestionIndex(0);
      setAiReplyReveal(false);
      setWhyThisReplyExplanation("");
      return;
    }

    const replies = generateDemoReplies(selectedMail);

    const base = replies[0];

    setBaseReply(base);
    setAiReply(base);
    setSuggestions(replies);

    replyVariantSeedsRef.current = replies;
    setSelectedSuggestionIndex(0);

    cancelReplyTyping();
    tonePreviewBackupRef.current = null;
    setHoveredTone(null);

    const ctx = extractContext(selectedMail);
    setWhyThisReplyExplanation(
      [
        "• Reply is a fixed template chosen from keywords in the message — the inbox body is never pasted into the reply.",
        ctx.sender ? `• Sender: ${ctx.sender}` : "• Sender: (not provided)",
        `• Link in message: ${ctx.hasLink ? "yes" : "no"}`,
        `• Urgency cue: ${ctx.urgency}`,
        `• Looks action-required: ${ctx.requiresAction ? "yes" : "no"}`,
        "• Edit the reply below or use tone chips (on hover / commit) — they do not run on mount.",
      ].join("\n")
    );
    setAiReplyReveal(true);
  }, [selectedMail]);

  useEffect(() => {
    console.log("FINAL AI:", aiReply);
  }, [aiReply]);

  const normalizeThreadSubject = useCallback((subject: string) => {
    return subject
      .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
      .trim()
      .toLowerCase();
  }, []);

  const threadMessages = useMemo(() => {
    if (!selectedMail) return [] as ProcessedMail[];
    const baseSubject = normalizeThreadSubject(selectedMail.subject || "");
    const baseThread = (selectedMail.thread || "").trim().toLowerCase();
    const sameThread = processedMails.filter((mail) => {
      if (mail.deleted) return false;
      const mailThread = (mail.thread || "").trim().toLowerCase();
      if (baseThread && mailThread) return baseThread === mailThread;
      return normalizeThreadSubject(mail.subject || "") === baseSubject;
    });
    return sameThread.sort(
      (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
    );
  }, [selectedMail, processedMails, normalizeThreadSubject]);
  const suggestedTone = useMemo(
    () => detectAutoTone(selectedMail ?? null),
    [selectedMail?.id, selectedMail?.title, selectedMail?.subject, selectedMail?.preview]
  );

  const detectedContext = useMemo((): "Meeting" | "Invoice" | "Support" => {
    if (!selectedMail) return "Support";
    return mailDetectedContextLabel(selectedMail);
  }, [selectedMail?.id, selectedMail?.intent]);

  const mainActionLabel = useMemo(() => {
    if (!selectedMail) return "Reply";
    const i = selectedMail.intent;
    if (i === "schedule") return "Schedule";
    if (i === "pay") return "Confirm";
    if (i === "reply" || i === "follow_up") return "Reply";
    return "Acknowledge";
  }, [selectedMail?.id, selectedMail?.intent]);

  const mailReplyHintStrings = aiAssistEnabled ? getSuggestions(selectedMail) : [];
  const isAutoReady = selectedMail?.confidence > 0.95;

  function selectSuggestion(index: number) {
    cancelReplyTyping();
    tonePreviewBackupRef.current = null;
    setHoveredTone(null);
    setSelectedSuggestionIndex(index);
    const seeds = replyVariantSeedsRef.current;
    const sugs = suggestionsRef.current;
    setBaseReply(seeds[index] ?? "");
    setAiReply(sugs[index] ?? "");
  }

  function applySmartAction(kind: "confirm" | "reschedule" | "ask_details") {
    if (!selectedMail || !smartActionsEnabled) return;
    cancelReplyTyping();
    const seed =
      kind === "ask_details"
        ? buildAskDetailsSeed(selectedMail)
        : buildQuickActionSeed(kind === "confirm" ? "confirm" : "reschedule", selectedMail);
    setReplyFromRawSeed(seed);
  }

  /** Idle 4s: subtle attention on highest-priority mail (clears on hover / activity). */
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setIdleAttentionMailId(null);
      return;
    }

    const clearIdleTimer = () => {
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const arm = () => {
      clearIdleTimer();
      setIdleAttentionMailId(null);
      if (!focusMail || hoveredMailId) return;
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        if (hoveredMailIdRef.current) return;
        setIdleAttentionMailId(focusMail.id);
      }, 4000);
    };

    arm();

    const onActivity = () => {
      clearIdleTimer();
      setIdleAttentionMailId(null);
      arm();
    };

    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      clearIdleTimer();
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [focusMail?.id, hoveredMailId]);

  useEffect(() => {
    if (!openedMail) return;
    setIsMailFullscreenOpen(false);
    const raf = window.requestAnimationFrame(() => {
      setIsMailFullscreenOpen(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [openedMail]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOpenedMail();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function closeOpenedMail() {
    setIsMailFullscreenOpen(false);
    window.setTimeout(() => {
      setOpenedMail(null);
      setOpenedMailRect(null);
    }, 350);
  }

  const clusterFields = (() => {
    if (displayMode === "flow") return [];

    const by: Record<
      string,
      { points: { x: number; y: number }[]; sumX: number; sumY: number }
    > = {};

    sortedMails.forEach((mail, idx) => {
      const base = flowBaseForIndex(idx);
      const x = mail.x ?? base.x;
      const y = mail.y ?? base.y;

      if (!by[mail.cluster]) by[mail.cluster] = { points: [], sumX: 0, sumY: 0 };
      by[mail.cluster].points.push({ x, y });
      by[mail.cluster].sumX += x;
      by[mail.cluster].sumY += y;
    });

    return Object.entries(by).map(([clusterKey, data]) => {
      const count = data.points.length;
      if (!count) return null;

      const cx = data.sumX / count;
      const cy = data.sumY / count;

      let maxDist = 0;
      for (const p of data.points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy);
        maxDist = Math.max(maxDist, d);
      }

      const r = Math.max(10, Math.min(38, maxDist));
      return { clusterKey, cx, cy, r };
    }).filter(Boolean) as { clusterKey: string; cx: number; cy: number; r: number }[];
  })();

  const focusedClusterField =
    smartFocusClusterKey != null
      ? clusterFields.find((f) => f.clusterKey === smartFocusClusterKey) ?? null
      : null;

  useEffect(() => {
    if (isHoveringMail.current) return;
    if (!selectedMail) return;

    const el = mailRefs.current[selectedMail.id];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    el.classList.add("mail-focus");
    const timeout = window.setTimeout(() => {
      el.classList.remove("mail-focus");
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [selectedMail]);

  useEffect(() => {
    if (!selectedMail) {
      setPredictedAction(null);
      return;
    }

    const nextActions = getActions(selectedMail);
    const primary = nextActions.find((a) => a.primary);

    setPredictedAction(primary?.value ?? null);
  }, [selectedMail]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || !predictedAction) return;

      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.closest("textarea, input, select, [contenteditable='true']") != null)
      ) {
        return;
      }

      e.preventDefault();
      handleAction(predictedAction);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [predictedAction, selectedMail]);

  useEffect(() => {
    if (isHoveringMail.current) return;
    if (!SHOW_MAIL_CONNECTORS) return;
    if (displayMode === "flow") return;

    const el = document.getElementById("network-canvas");
    if (!el || !(el instanceof HTMLCanvasElement)) return;

    const canvasEl = el;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const ctx2d = ctx;

    function draw() {
      const host = canvasEl.parentElement;
      if (!host) return;

      const { width: cw, height: ch } = host.getBoundingClientRect();
      if (cw <= 0 || ch <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = Math.max(1, Math.floor(cw * dpr));
      canvasEl.height = Math.max(1, Math.floor(ch * dpr));
      canvasEl.style.width = `${cw}px`;
      canvasEl.style.height = `${ch}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, cw, ch);

      if (!hoveredMailId && !focusMail) {
        return;
      }

      const hostRect = host.getBoundingClientRect();

      const mails = sortedMails;

      const positions = mails.map((mail) => {
        const el = mailRefs.current[mail.id];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - hostRect.left,
          y: rect.top + rect.height / 2 - hostRect.top,
        };
      });

      for (let i = 0; i < mails.length; i++) {
        for (let j = i + 1; j < mails.length; j++) {
          if (!mails[i] || !mails[j]) continue;
          if (!positions[i] || !positions[j]) continue;

          const isHoveredConnection =
            mails[i].id === hoveredMailId || mails[j].id === hoveredMailId;

          const isFocusConnection =
            mails[i].id === focusMail?.id || mails[j].id === focusMail?.id;

          if (
            (isHoveredConnection || isFocusConnection) &&
            (mails[i].sender === mails[j].sender ||
              mails[i].intent === mails[j].intent)
          ) {
            const pi = positions[i]!;
            const pj = positions[j]!;

            ctx2d.beginPath();
            ctx2d.moveTo(pi.x, pi.y);
            ctx2d.lineTo(pj.x, pj.y);

            ctx2d.strokeStyle = isHoveredConnection
              ? glowForTheme(themeMode, 0.6)
              : glowForTheme(themeMode, 0.25);

            ctx2d.lineWidth = isHoveredConnection ? 2 : 1;

            ctx2d.stroke();
          }
        }
      }
    }

    draw();
    const raf = requestAnimationFrame(draw);

    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    const host = canvasEl.parentElement;
    if (host) ro.observe(host);
    const mailList = canvasEl.closest(".mail-list");
    if (mailList) ro.observe(mailList);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [mails, displayMode, networkMailOrderKey, hoveredMailId, focusMail?.id]);

  function removeMail(id: string) {
    setMails((prev) => {
      if (!prev.some((m) => m.id === id)) return prev;
      const index = prev.findIndex((m) => m.id === id);
      const next = prev[index + 1] ?? prev[index - 1];
      const filtered = prev.filter((m) => m.id !== id);
      setSelectedMailId(next?.id ?? filtered[0]?.id ?? "");
      return filtered;
    });
  }

  function selectNextMail(currentId: string) {
    removeMail(currentId);
  }

  async function handleSend() {
    if (!selectedMail) return;

    setUserStats((prev) => ({
      ...prev,
      actions: prev.actions + 1,
    }));

    const id = selectedMail.id;
    const body = aiReply;
    setProcessingId(id);

    try {
      await sendReplyMail(id, body);
      setBaseReply("");
      setAiReply("");
      setSuggestions([]);
      replyVariantSeedsRef.current = [];
      setSelectedSuggestionIndex(0);
    } catch (err) {
      setAiReply(
        (prev) =>
          `${prev}\n[Send failed: ${err instanceof Error ? err.message : "error"}]`
      );
    } finally {
      setProcessingId(null);
    }
  }

  function handleAction(action: string) {
    if (!selectedMail) return;

    setUserStats((prev) => ({
      ...prev,
      actions: prev.actions + 1,
    }));

    const id = selectedMail.id;
    setProcessingId(id);

    if (action === "confirm" || action === "schedule") {
      setReplyFromRawSeed("Confirmed. See you then.");
    }

    if (action === "reschedule") {
      setReplyFromRawSeed("Can we move to another time?");
    }

    if (action === "decline") {
      setReplyFromRawSeed("I won't be able to attend.");
    }

    if (action === "pay") {
      setReplyFromRawSeed("Payment submitted — thank you.");
    }

    if (action === "ask_invoice") {
      setReplyFromRawSeed("Could you please resend the invoice or payment link?");
    }

    if (action === "delay") {
      setReplyFromRawSeed("I'll complete this a bit later and will update you soon.");
    }

    if (action === "reply") {
      setReplyFromRawSeed("Thanks — here's a quick reply.");
    }

    if (action === "clarify") {
      setReplyFromRawSeed("Could you share a few more details so I can respond accurately?");
    }

    if (action === "read") {
      setReplyFromRawSeed("Noted — I've read your message.");
    }

    setTimeout(() => {
      removeMail(id);
      selectNextMail(id);
      setProcessingId(null);
      setBaseReply("");
      setAiReply("");
      setSuggestions([]);
      replyVariantSeedsRef.current = [];
      setSelectedSuggestionIndex(0);
    }, 0);
  }

  handleActionRef.current = handleAction;

  // Demo: AUTO_MODE predictive auto-actions disabled (no delayed handleAction).
  // useEffect(() => {
  //   if (!AUTO_MODE) return;
  //   if (!selectedMail) return;
  //   if (selectedMail.confidence > 0.98 && predictedAction) {
  //     const timer = setTimeout(() => {
  //       handleActionRef.current(predictedAction);
  //     }, 800);
  //     return () => clearTimeout(timer);
  //   }
  // }, [selectedMail, predictedAction]);

  useEffect(() => {
    // We intentionally avoid Matter.Render and keep React DOM as the renderer.
    void Render;

    const bubbles = Array.from(document.querySelectorAll<HTMLElement>(".nav-bubble"));
    if (bubbles.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const wallThickness = 80;

    const engine = Engine.create();
    engine.gravity.x = 0;
    engine.gravity.y = 0;

    const world = engine.world;
    const runner = Runner.create();

    const boundaries = [
      Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, {
        isStatic: true,
      }),
      Bodies.rectangle(
        width / 2,
        height + wallThickness / 2,
        width,
        wallThickness,
        { isStatic: true }
      ),
      Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, {
        isStatic: true,
      }),
      Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height,
        { isStatic: true }
      ),
    ];
    Composite.add(world, boundaries);

    const bubbleEntries = bubbles.map((bubble) => {
      const rect = bubble.getBoundingClientRect();
      const radius = Math.max(rect.width, rect.height) / 2;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const body = Bodies.circle(centerX, centerY, radius, {
        restitution: 0.9,
        friction: 0.01,
        frictionAir: 0.03,
        density: 0.0014,
      });

      Composite.add(world, body);
      return {
        bubble,
        body,
        centerX,
        centerY,
      };
    });

    const mouse = Mouse.create(document.body);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.15,
        damping: 0.2,
        render: { visible: false },
      },
    });
    Composite.add(world, mouseConstraint);

    Runner.run(runner, engine);

    const driftIntervalId = window.setInterval(() => {
      bubbleEntries.forEach(({ body }) => {
        const fx = (Math.random() * 2 - 1) * 0.00055;
        const fy = (Math.random() * 2 - 1) * 0.00055;
        body.force.x += fx;
        body.force.y += fy;
      });
    }, 900);

    let rafId = 0;
    const syncPositions = () => {
      bubbleEntries.forEach(({ bubble, body, centerX, centerY }) => {
        const dx = body.position.x - centerX;
        const dy = body.position.y - centerY;
        bubble.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      rafId = window.requestAnimationFrame(syncPositions);
    };
    rafId = window.requestAnimationFrame(syncPositions);

    return () => {
      window.clearInterval(driftIntervalId);
      window.cancelAnimationFrame(rafId);
      Runner.stop(runner);
      Composite.clear(world, false, true);
      Engine.clear(engine);

      bubbleEntries.forEach(({ bubble }) => {
        bubble.style.transform = "";
      });
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const bubbles = document.querySelectorAll(".nav-bubble");

      bubbles.forEach((b) => {
        if (Math.random() > 0.7) {
          b.classList.add("pulse-light");

          setTimeout(() => {
            b.classList.remove("pulse-light");
          }, 800);
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const bubbles = Array.from(
        document.querySelectorAll<HTMLElement>(".nav-bubble")
      );

      bubbles.forEach((bubble, index) => {
        const a = bubble.getBoundingClientRect();
        const ax = a.left + a.width / 2;
        const ay = a.top + a.height / 2;

        let hasNearbyBubble = false;
        for (let i = 0; i < bubbles.length; i += 1) {
          if (i === index) continue;
          const b = bubbles[i].getBoundingClientRect();
          const bx = b.left + b.width / 2;
          const by = b.top + b.height / 2;
          const distance = Math.hypot(ax - bx, ay - by);
          if (distance < 150) {
            hasNearbyBubble = true;
            break;
          }
        }

        if (hasNearbyBubble) {
          bubble.classList.add("bubble-near");
        } else {
          bubble.classList.remove("bubble-near");
        }
      });
    }, 200);

    return () => window.clearInterval(interval);
  }, []);

  if (!bootDone) {
    return (
      <BootScreen
        onFinish={() => {
          setBootDone(true);
          setAppReady(true);
        }}
      />
    );
  }

  const showClusterFocusUi = displayMode !== "flow" && smartFocusClusterKey != null;
  const legacyThemeMode:
    | "purple"
    | "expanse"
    | "orbital"
    | "redblack"
    | "light"
    | "carbonite"
    | "blacken"
    | "forge"
    | "voidbeast" = (() => {
    if (themeMode === "aether") return "purple";
    if (themeMode === "orbital") return "orbital";
    if (themeMode === "ember") return "forge";
    if (themeMode === "nova") return "light";
    if (themeMode === "blacken") return "blacken";
    if (themeMode === "voidbeast") return "voidbeast";
    return "carbonite";
  })();
  const activeThemeClass = THEMES.find((t) => t.id === themeMode)?.class ?? "";

  return (
    <OpenmailSecurityProvider
      demoMode={OPENMAIL_DEMO_MODE}
      onQuarantineMail={handleQuarantineFromLink}
      onMaliciousLinkDetected={triggerLinkThreatFlash}
    >
    <>
      <div className={`app-reveal ${appReady ? "visible" : ""}`}>
        <div
          ref={appLayoutRef}
          className={`app-layout ${activeThemeClass}${isThemeTransitioning ? " theme-transition" : ""}${
            openedMail ? " god-focus-open" : ""
          }${linkThreatFlash ? " god-link-threat-flash" : ""}`}
          data-theme={legacyThemeMode}
          data-theme-preview={themePreviewMode ?? undefined}
          data-god-risk={
            selectedMail?.securityLevel === "high_risk" ? "high" : undefined
          }
          data-god-inline-focus={
            selectedMail && !openedMail ? "true" : undefined
          }
        >
        <div id="background-effects" ref={backgroundEffectsRef} aria-hidden />
        <div id="ui-layer">
        <header className="app-ribbon glass-panel-chrome weave-silent">
            <div className="control-center">
              <div className="cc-block-grid ribbon-three">
                <div className="control-block ribbon-panel menu-group glass-panel glass-depth-1">
                  <div className="menu-clean-list menu-grid-six" role="toolbar" aria-label="Primary actions">
                    {menuActions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`menu-item menu-clean-btn button magnetic-ui button-liquid menu-grid-item ${
                          isMenuActionActive(item.key) ? "active" : ""
                        }`}
                        onClick={() => handleMenuAction(item.key)}
                        disabled={item.disabled}
                        title={item.label}
                      >
                        <OpenMailIcon
                          name={item.icon}
                          size={18}
                          className={`inline-block align-middle shrink-0 ${item.breathing ? "icon-breathe" : ""}`}
                          alt=""
                        />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-block ribbon-panel display-modes glass-panel glass-depth-1">
                  <div className="display-modes-title-row">
                    <div className="display-modes-title-col display-modes-title-col--view">
                      <div className="cc-block-title">DISPLAY</div>
                    </div>
                    <div className="display-modes-title-col display-modes-title-col--themes">
                      <div className="cc-block-title altered-carbon-title">
                        Altered Carbon
                      </div>
                    </div>
                  </div>
                  <div className="display-layout-split">
                    <div className="display-modes-column display-modes-column--view display-block">
                      <div className="view-mode-block glass-plate">
                        <div className="cc-block-title display-subtitle">View Mode</div>
                        <div className="view-mode-column" role="radiogroup" aria-label="Mail display mode">
                          <button
                            type="button"
                            className={`ribbon-round-btn display-mode-btn button magnetic-ui button-liquid ${displayMode === "flow" ? "active" : ""}`}
                            onClick={() => {
                              setManualMode(true);
                              setDisplayMode("flow");
                            }}
                            aria-pressed={displayMode === "flow"}
                          >
                            Flow
                          </button>
                          <button
                            type="button"
                            className={`ribbon-round-btn display-mode-btn button magnetic-ui button-liquid ${displayMode === "grid" ? "active" : ""}`}
                            onClick={() => {
                              setManualMode(true);
                              setDisplayMode("grid");
                            }}
                            aria-pressed={displayMode === "grid"}
                          >
                            Grid
                          </button>
                          <button
                            type="button"
                            className={`ribbon-round-btn display-mode-btn button magnetic-ui button-liquid ${displayMode === "list" ? "active" : ""}`}
                            onClick={() => {
                              setManualMode(true);
                              setDisplayMode("list");
                            }}
                            aria-pressed={displayMode === "list"}
                          >
                            List
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="display-modes-column display-modes-column--themes display-block theme-mode-block">
                      <div className="altered-carbon-group" role="radiogroup" aria-label="Altered Carbon theme selector">
                        {THEMES.map((theme) => (
                          <button
                            key={theme.id}
                            type="button"
                            className={`theme-card ${theme.id} button magnetic-ui button-liquid ${
                              themeMode === theme.id ? "active" : ""
                            }`}
                            onClick={() => setThemeMode(theme.id as ThemeMode)}
                            onMouseEnter={() => setThemePreviewMode(theme.id as ThemeMode)}
                            onMouseLeave={() => setThemePreviewMode(null)}
                            onFocus={() => setThemePreviewMode(theme.id as ThemeMode)}
                            onBlur={() => setThemePreviewMode(null)}
                            aria-pressed={themeMode === theme.id}
                            aria-label={`${theme.label} material theme`}
                            title={theme.label}
                          >
                            <img
                              src={theme.icon}
                              alt={theme.label}
                              className="theme-card-image"
                              onError={(e) => {
                                const fb = THEME_ICON_FALLBACK[theme.id];
                                if (!fb || e.currentTarget.dataset.fallbackApplied === "1") {
                                  return;
                                }
                                e.currentTarget.dataset.fallbackApplied = "1";
                                e.currentTarget.src = fb;
                              }}
                            />
                            <span className="theme-card-fx theme-card-bloom" aria-hidden="true" />
                            <span className="theme-card-fx theme-card-ring" aria-hidden="true" />
                            <span className="theme-card-label">{theme.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="control-block ribbon-panel core-features glass-panel glass-depth-1">
                  <div className="cc-block-title">CORE</div>
                  <div className="ribbon-core-hint" aria-hidden="true">
                    {`AI ${aiAssistEnabled ? "On" : "Off"} · Context ${contextSource.toUpperCase()} · Actions ${smartActionsEnabled ? "On" : "Off"}`}
                  </div>
                  <div className="cc-icon-list">
                    <button
                      type="button"
                      className={`cc-icon-item button magnetic-ui button-liquid ${aiAssistEnabled ? "active" : ""}`}
                      onClick={() => handleCoreFeature("ai")}
                      aria-pressed={aiAssistEnabled}
                    >
                      <span className="cc-icon-circle">
                        <OpenMailIcon name="settings" size={16} alt="" />
                      </span>
                      <span className="cc-icon-label">AI</span>
                    </button>
                    <button
                      type="button"
                      className={`cc-icon-item button magnetic-ui button-liquid ${contextSource !== "mail" ? "active" : ""}`}
                      onClick={() => handleCoreFeature("context")}
                      aria-pressed={contextSource !== "mail"}
                      title={`Context source: ${contextSource}`}
                    >
                      <span className="cc-icon-circle">
                        <OpenMailIcon name="contacts" size={16} alt="" />
                      </span>
                      <span className="cc-icon-label">Context</span>
                    </button>
                    <button
                      type="button"
                      className={`cc-icon-item button magnetic-ui button-liquid ${smartActionsEnabled ? "active" : ""}`}
                      onClick={() => handleCoreFeature("actions")}
                      aria-pressed={smartActionsEnabled}
                    >
                      <span className="cc-icon-circle">
                        <OpenMailIcon name="sync" size={16} alt="" />
                      </span>
                      <span className="cc-icon-label">Actions</span>
                    </button>
                  </div>
                </div>
            </div>
          </div>
        </header>

        <div className="app-body">
          <aside className={`sidebar glass-panel-chrome weave-silent ${sidebarCollapsed ? "collapsed" : ""}`}>
            <button
              type="button"
              className={`sidebar-item sidebar-compose-primary ${
                composeModalOpen ? "active" : ""
              }`}
              onClick={() => setComposeModalOpen(true)}
              title="Compose new email"
            >
              <OpenMailIcon name="draft" size={20} className="shrink-0" alt="" />
              <span className="sidebar-item-label">COMPOSE</span>
            </button>
            <button
              type="button"
              className="sidebar-item sidebar-collapse-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <OpenMailIcon name={sidebarCollapsed ? "inbox" : "settings"} size={18} className="shrink-0" alt="" />
              <span className="sidebar-item-label">{sidebarCollapsed ? "Expand" : "Collapse"}</span>
            </button>
            {folders.map((folder) => {
              const leadIcon =
                folder === "inbox"
                  ? ("inbox" as const)
                  : folder === "sent"
                    ? ("send" as const)
                    : folder === "drafts"
                      ? ("draft" as const)
                      : folder === "quarantine"
                        ? ("settings" as const)
                        : folder === "ai_flagged"
                          ? ("reply" as const)
                          : folder === "follow_ups"
                            ? ("sync" as const)
                      : folder === "delete"
                        ? ("delete" as const)
                        : null;
              const folderLabel =
                folder === "quarantine"
                  ? `QUARANTINE (${quarantineCount})`
                  : folder.toUpperCase();
              return (
                <div
                  key={folder}
                  className={`menu-item sidebar-item ${activeFilter === folder ? "active" : ""}`}
                  onClick={() => handleFolderChange(folder)}
                  title={folderLabel}
                >
                  {leadIcon ? (
                    <OpenMailIcon
                      name={leadIcon}
                      size={18}
                      className="shrink-0"
                      alt=""
                    />
                  ) : null}
                  <span className="sidebar-item-label">
                    {folderLabel}
                  </span>
                </div>
              );
            })}

            <div
              className="menu-item sidebar-item smart sidebar-group-start"
              onClick={() => setSmartFolders(generateSmartFolders(processedMails))}
              title="SMART FOLDERS"
            >
              <OpenMailIcon name="sync" size={18} className="shrink-0 icon-breathe" alt="" />
              <span className="sidebar-item-label">SMART FOLDERS</span>
            </div>

            {Object.entries(smartFolders).map(([key, folderMails]) => (
              <div
                key={key}
                className={`menu-item sidebar-item smart-folder ${
                  activeFilter === key ? "active" : ""
                }`}
                onClick={() => setActiveFilter(key)}
                title={`${key.toUpperCase()} (${folderMails.length})`}
              >
                <OpenMailIcon name="draft" size={18} className="shrink-0" alt="" />
                <span className="sidebar-item-label">
                  {key.toUpperCase()} ({folderMails.length})
                </span>
              </div>
            ))}

            <div
              className="menu-item sidebar-item smart"
              aria-label={
                activeContext
                  ? `Contexts; largest group has ${activeContext.length} messages`
                  : "Contexts"
              }
              title="CONTEXTS"
            >
              <OpenMailIcon name="calendar" size={18} className="shrink-0" alt="" />
              <span className="sidebar-item-label">CONTEXTS</span>
            </div>

            {Object.entries(mailContexts).map(([key, ctxMails]) => (
              <div
                key={`ctx-${key}`}
                className={`menu-item sidebar-item smart-folder context-folder ${
                  activeFilter === key ? "active" : ""
                }`}
                onClick={() => setActiveFilter(key)}
                title={`${key.toUpperCase()} (${ctxMails.length})`}
              >
                <OpenMailIcon name="reply" size={18} className="shrink-0" alt="" />
                <span className="sidebar-item-label">
                  {key.toUpperCase()} ({ctxMails.length})
                </span>
              </div>
            ))}

            <button
              type="button"
              className="menu-item sidebar-item smart sidebar-group-start w-full text-left"
              onClick={() => setFeatureWipModal("contacts")}
              title="CONTACTS"
            >
              <OpenMailIcon name="contacts" size={18} className="shrink-0" alt="" />
              <span className="sidebar-item-label">CONTACTS</span>
            </button>

            <button
              type="button"
              className="menu-item sidebar-item smart w-full text-left"
              onClick={() => setFeatureWipModal("calendar")}
              title="CALENDAR"
            >
              <OpenMailIcon name="calendar" size={18} className="shrink-0" alt="" />
              <span className="sidebar-item-label">CALENDAR</span>
            </button>
          </aside>

          <main className="mail-panel">
          <section className="mail-list glass-panel-chrome weave-silent">
            {syncError ? (
              <div
                className="openmail-sync-banner glass-panel glass-depth-1 mb-3 px-4 py-2 flex items-center justify-between gap-3 text-[11px] text-red-200/95 border border-red-400/25"
                role="alert"
              >
                <span>{syncError}</span>
                <button
                  type="button"
                  className="button magnetic-ui button-liquid px-2 py-1 text-[10px] uppercase shrink-0"
                  onClick={() => clearSyncError()}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <div className="decision-panel suggested-decision glass-panel glass-depth-2 weave-energy">
              <div className="decision-title">AI INSIGHT</div>

              <div className={`ai-insight-status inbox-health health-${inboxHealth}`}>
                {inboxHealthLabel}
              </div>

              <div className="ai-insight-mail-list" aria-label="Contextual suggestions">
                {insightMails.length === 0 ? (
                  <div className="ai-insight-empty">No messages to analyze.</div>
                ) : (
                  insightMails.map((mail) => {
                    const hint = getSuggestions(mail)[0] ?? "";
                    return (
                      <div key={mail.id} className="ai-insight-mail-row">
                        <div className="ai-insight-mail-subject">{mail.subject}</div>
                        <div className="ai-insight-mail-hint">{hint}</div>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                className="decision-view-suggestion button magnetic-ui button-liquid"
                onClick={() => previewInsight()}
              >
                [ View suggestion ]
              </button>
            </div>

            <div
              className={`mail-container ${displayMode}${
                showClusterFocusUi ? " cluster-zoom" : ""
              }${actionFeedbackType ? ` action-feedback-${actionFeedbackType}` : ""}`}
              data-god-hover={hoveredMailId ?? undefined}
              style={
                showClusterFocusUi
                  ? {
                      transform: "scale(1.1)",
                      transformOrigin:
                        focusedClusterField != null
                          ? `${focusedClusterField.cx}% ${focusedClusterField.cy}%`
                          : "50% 50%",
                      transition:
                        "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }
                  : undefined
              }
            >
              {accountHydrated && !storedAccount && !OPENMAIL_DEMO_MODE ? (
                <div className="openmail-empty-mail-client openmail-empty-system-ready glass-panel glass-depth-1 weave-energy flex flex-col items-center justify-center gap-5 min-h-[min(420px,55vh)] p-10 text-center">
                  <p className="text-white/85 text-sm tracking-wide">
                    System ready. Awaiting connection.
                  </p>
                  <button
                    type="button"
                    className="mail-send-btn openmail-empty-state-btn button magnetic-ui button-liquid weave-focus px-6 py-2.5 text-[11px] uppercase"
                    onClick={() => setAccountModalOpen(true)}
                  >
                    Add account
                  </button>
                </div>
              ) : activeFilter === "sent" && folderLoading ? (
                <div className="openmail-empty-mail-client glass-panel glass-depth-1 weave-energy flex flex-col items-center justify-center gap-4 min-h-[min(420px,55vh)] p-10 text-center">
                  <p className="text-white/80 text-sm tracking-wide">
                    Loading sent mails...
                  </p>
                </div>
              ) : accountHydrated && storedAccount && sortedMails.length === 0 ? (
                <div className="openmail-empty-mail-client glass-panel glass-depth-1 weave-energy flex flex-col items-center justify-center gap-4 min-h-[min(420px,55vh)] p-10 text-center">
                  <p className="text-white/80 text-sm tracking-wide">
                    No messages in this folder.
                  </p>
                  <button
                    type="button"
                    className="mail-send-btn button magnetic-ui button-liquid weave-focus px-5 py-2 text-[11px] uppercase flex items-center gap-2"
                    onClick={() => {
                      void syncFromImap();
                    }}
                    disabled={isSyncing}
                  >
                    <OpenMailIcon name="sync" size={15} alt="" />
                    {isSyncing ? "Syncing…" : "Sync"}
                  </button>
                </div>
              ) : (
              <>
              {SHOW_MAIL_CONNECTORS && displayMode !== "flow" && (
              <canvas
                id="network-canvas"
                className="mail-network-canvas"
              />
              )}
              {displayMode !== "flow" &&
                clusterFields.map((f) => (
                  <div
                    key={`field-${f.clusterKey}`}
                    className={`cluster-field${
                      smartFocusClusterKey && f.clusterKey === smartFocusClusterKey
                        ? " cluster-field-hot"
                        : ""
                    }`}
                    style={{
                      left: `${f.cx}%`,
                      top: `${f.cy}%`,
                      width: `${f.r * 2}%`,
                      height: `${f.r * 2}%`,
                    }}
                  />
                ))}
              {inboxListRows.map((row, rowIndex) => {
                function makeCard(mail: ProcessedMail, flowTier?: FlowVisualTier) {
                const selected = selectedMail?.id === mail.id;
                const hovered = hoveredMailId === mail.id;
                const isInFocusedCluster =
                  !!smartFocusClusterKey && mail.cluster === smartFocusClusterKey;
                const leaderId = focusedClusterKey
                  ? focusedLeader?.id
                  : focusMail?.id;
                const isClusterLeader = !!leaderId && mail.id === leaderId;

                const isClusterFaded =
                  showClusterFocusUi &&
                  smartFocusClusterKey != null &&
                  !isInFocusedCluster;
                const feedbackClass = mailFeedback[mail.id]
                  ? `mail-feedback-${mailFeedback[mail.id]}`
                  : "";

                let cardStyle: CSSProperties = {};
                if (displayMode === "flow") {
                  const stackOffsetX = 0;
                  cardStyle = {
                    position: "relative",
                    width: "100%",
                    ["--stack-x" as string]: `${stackOffsetX}px`,
                  } as CSSProperties;
                } else if (displayMode === "grid") {
                  cardStyle = {
                    position: "relative",
                  };
                } else {
                  cardStyle = {
                    position: "relative",
                    width: "100%",
                  };
                }
                const riskUi = getRiskPresentation(mail.securityLevel);
                const threatVis = OPENMAIL_DEMO_MODE
                  ? openMailThreatPresentation(mail).variant
                  : null;
                const hasAttachments = (mail.attachments?.length ?? 0) > 0;
                const hasLinks = mailContainsDetectableUrls(mail);
                const metaIconsAria =
                  hasAttachments || hasLinks
                    ? `${[
                        hasAttachments ? "Has attachments" : null,
                        hasLinks ? "Contains links" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}. ${riskUi.label}.`
                    : undefined;
                return (
                  <div
                    ref={(el) => {
                      mailRefs.current[mail.id] = el;
                    }}
                    className={`mail-card glass-panel glass-depth-2${
                      threatVis ? ` mail-card--threat-${threatVis}` : ""
                    } ${
                      mail.id === focusMail?.id ? "focus" : "dim"
                    } ${selected ? "active weave-focus" : ""} ${
                      processingId === mail.id ? "processing" : ""
                    } ${
                      hovered ? "hovered" : ""
                    } ${
                      intentPreviewMailId === mail.id ? "god-intent-preview" : ""
                    } ${
                      idleAttentionMailId === mail.id ? "god-idle-attention" : ""
                    } ${
                      predictiveWarmMailId === mail.id && hovered
                        ? "predictive-warm"
                        : ""
                    } ${
                      feedbackClass
                    } ${
                      showClusterFocusUi
                        ? isClusterFaded
                          ? "smart-focus-secondary"
                          : isClusterLeader
                            ? "cluster-leader"
                            : "smart-focus-primary"
                        : displayMode !== "flow" && isClusterLeader
                          ? "cluster-leader"
                          : ""
                    }${
                      displayMode === "flow" && flowTier
                        ? ` flow-stream-card flow-card--${flowTier}`
                        : ""
                    }${
                      displayMode === "flow" &&
                      flowTier === "hero" &&
                      (mail.priority === "urgent" || mail.priorityScore >= 52)
                        ? " flow-priority-hot"
                        : ""
                    }${
                      displayMode === "flow" &&
                      flowTier === "compact" &&
                      !selected &&
                      !hovered
                        ? " flow-value-dim"
                        : ""
                    }`}
                    data-flow-tier={
                      displayMode === "flow" && flowTier ? flowTier : undefined
                    }
                    style={cardStyle}
                    onMouseMove={(event) => {
                      handleMailCardSheenMove(event);
                      if (selected) handleFocusMouseMove(event);
                    }}
                    onMouseLeave={(event) => {
                      isHoveringMail.current = false;
                      resetMailCardSheen(event.currentTarget);
                      handleFocusMouseLeave(event);
                      setHoveredMailId(null);
                      cancelPendingPredictiveSelect();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setOpenedMailRect({
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                      });
                      setOpenedMail(mail);
                      flushSelectMail(mail);
                      setFocusedClusterKey((prev) =>
                        prev === mail.cluster ? null : mail.cluster
                      );
                    }}
                    onMouseEnter={() => {
                      isHoveringMail.current = true;
                      if (
                        focusedClusterKeyRef.current &&
                        mail.cluster !== focusedClusterKeyRef.current
                      ) {
                        return;
                      }
                      setHoveredMailId(mail.id);
                      setIdleAttentionMailId(null);
                      schedulePredictiveSelect(mail);
                    }}
                    onFocus={() => {
                      if (
                        focusedClusterKeyRef.current &&
                        mail.cluster !== focusedClusterKeyRef.current
                      ) {
                        return;
                      }
                      setHoveredMailId(mail.id);
                      schedulePredictiveSelect(mail);
                    }}
                    onBlur={(event) => {
                      isHoveringMail.current = false;
                      resetMailCardSheen(event.currentTarget);
                      cancelPendingPredictiveSelect();
                      setHoveredMailId(null);
                    }}
                    tabIndex={0}
                    data-confidence={mail.intentConfidence > 0.9 ? "high" : "neutral"}
                    data-risk-tier={riskUi.tier}
                    data-risk-score={mail.securityRiskScore}
                    data-god-intent={
                      mail.intent === "schedule"
                        ? "schedule"
                        : mail.intent === "reply" || mail.intent === "follow_up"
                          ? "reply"
                          : "read"
                    }
                  >
                    {riskUi.tier === "high" && (
                      <span className="god-risk-ring" aria-hidden />
                    )}
                    <span className="mail-card-sheen" aria-hidden>
                      <span className="mail-card-sheen-inner" />
                    </span>
                    {displayMode === "flow" && (() => {
                      const fp = getFlowPrimaryAction(mail);
                      return (
                        <div
                          className="flow-stream-action"
                          data-flow-primary={fp.kind}
                        >
                          <span className="flow-stream-primary-label">
                            {fp.label}
                          </span>
                        </div>
                      );
                    })()}
                    {mail.resolved && <div className="mail-status-badge status-resolved">resolved</div>}
                    {mail.scheduled && <div className="mail-status-badge status-scheduled">scheduled</div>}
                    <div className="mail-card-content">
                      <div className="mail-card-text-column">
                        <div className="mail-top">
                          {mail.securityLevel === "suspicious" && (
                            <div
                              className="mail-security-badge mail-security-badge--warning"
                              title={
                                mail.securityReason ||
                                "Suspicious — review recommended"
                              }
                            >
                              Warning
                            </div>
                          )}
                          <div className="mail-title">
                            {mail.read === false ? (
                              <span className="mail-unread-dot" aria-label="Unread" />
                            ) : null}
                            {mail.title}
                            {shouldShowMailListPriorityBolt(mail) ? (
                              <span className="mail-priority" aria-hidden>
                                ⚡
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mail-subject">{mail.subject}</div>

                        <div className="mail-preview">{mail.preview}</div>
                      </div>
                      <div
                        className={`mail-action-wrap${
                          displayMode === "flow" ? " flow-ai-action-secondary" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className={`mail-action-block${
                            aiInsightPanelMailId === mail.id
                              ? " mail-action-block--open"
                              : ""
                          }`}
                          data-risk-tier={riskUi.tier}
                          data-action={
                            mail.intent === "schedule"
                              ? "schedule"
                              : mail.intent === "reply" ||
                                  mail.intent === "follow_up"
                                ? "reply"
                                : "read"
                          }
                          title={getMailActionTooltip(mail)}
                          aria-label={`${getAiTag(mail.intent)} ${mail.securityRiskScore}. ${getMailActionLine2(mail)}. Open AI insight.`}
                          aria-haspopup="dialog"
                          aria-expanded={aiInsightPanelMailId === mail.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (aiInsightPanelMailId === mail.id) {
                              closeAiInsightPanel();
                            } else {
                              openAiInsightPanel(mail);
                            }
                          }}
                        >
                          <span className="mail-action-insight-label">AI INSIGHT</span>
                          <span className="mail-action-line1">
                            {getAiTag(mail.intent)} · {mail.securityRiskScore}
                          </span>
                          <span className="mail-action-line2">
                            {getMailActionLine2(mail)}
                          </span>
                        </button>
                        {(hasAttachments || hasLinks) && (
                          <div
                            className="mail-card-meta-icons"
                            data-meta-risk-tier={riskUi.tier}
                            aria-label={metaIconsAria}
                          >
                            {hasAttachments && (
                              <span
                                className="mail-card-meta-icon"
                                title="Has attachments"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden
                                >
                                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                              </span>
                            )}
                            {hasLinks && (
                              <span
                                className="mail-card-meta-icon"
                                title="Contains links"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden
                                >
                                  <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
                                  <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
                                </svg>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
                }

                if (row.type === "flow-group") {
                  const allMails = [row.leader, ...row.followers];
                  const relatedOpen = isFlowClusterExpanded(
                    row.clusterKey,
                    allMails,
                    flowClusterExpanded
                  );
                  return (
                    <div
                      key={row.clusterKey}
                      className="flow-intelligent-group"
                      style={
                        {
                          ["--flow-section-i" as string]: String(rowIndex),
                        } as CSSProperties
                      }
                    >
                      <div
                        className="flow-stream-section flow-group-context glass-panel glass-depth-1"
                        style={
                          {
                            ["--flow-stream-i" as string]: String(rowIndex * 4),
                          } as CSSProperties
                        }
                      >
                        <span className="flow-related-count">
                          RELATED ({row.total})
                        </span>
                        <span className="flow-group-context-title">
                          {row.title}
                        </span>
                      </div>
                      <div
                        className="flow-stream-section"
                        style={
                          {
                            ["--flow-stream-i" as string]: String(
                              rowIndex * 4 + 1
                            ),
                          } as CSSProperties
                        }
                      >
                        <div
                          className="flow-mail-slot"
                          ref={(el) => {
                            flowSlotRefs.current[row.leader.id] = el;
                          }}
                        >
                          {makeCard(row.leader, row.leaderTier)}
                        </div>
                      </div>
                      {row.followers.length > 0 ? (
                        <div
                          className={`flow-related-stack${
                            relatedOpen ? " flow-related-stack--open" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="flow-related-toggle magnetic-ui button-liquid flow-stream-section"
                            style={
                              {
                                ["--flow-stream-i" as string]: String(
                                  rowIndex * 4 + 2
                                ),
                              } as CSSProperties
                            }
                            aria-expanded={relatedOpen}
                            onClick={() => {
                              setFlowClusterExpanded((prev) => ({
                                ...prev,
                                [row.clusterKey]: !relatedOpen,
                              }));
                            }}
                          >
                            RELATED ({row.followers.length})
                          </button>
                          <div className="flow-related-body">
                            <div className="flow-related-inner">
                              {row.followers.map((follower, fi) => (
                                <div
                                  key={follower.id}
                                  className="flow-stream-section flow-related-follower-wrap"
                                  style={
                                    {
                                      ["--flow-stream-i" as string]: String(
                                        rowIndex * 4 + 3 + fi
                                      ),
                                    } as CSSProperties
                                  }
                                >
                                  <div
                                    className="flow-mail-slot flow-related-slot"
                                    ref={(el) => {
                                      flowSlotRefs.current[follower.id] = el;
                                    }}
                                  >
                                    {makeCard(
                                      follower,
                                      flowVisualTier(follower)
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                const mail = row.mail;
                const flowTier = row.flowTier;
                if (displayMode === "flow") {
                  return (
                    <div
                      key={mail.id}
                      className="flow-stream-section"
                      style={
                        {
                          ["--flow-stream-i" as string]: String(rowIndex),
                        } as CSSProperties
                      }
                    >
                      <div
                        className="flow-mail-slot"
                        ref={(el) => {
                          flowSlotRefs.current[mail.id] = el;
                        }}
                      >
                        {makeCard(mail, flowTier)}
                      </div>
                    </div>
                  );
                }
                return (
                  <Fragment key={mail.id}>{makeCard(mail, flowTier)}</Fragment>
                );
              })}
              </>
              )}
            </div>
          </section>
          </main>

          <aside
            className={`reply-panel right-column glass-panel glass-panel-chrome weave-focus glass-depth-1${
              predictiveWarmMailId &&
              selectedMail?.id === predictiveWarmMailId
                ? " predictive-panel-ready"
                : ""
            }${
              selectedMail?.securityLevel === "high_risk"
                ? " god-high-risk-context"
                : ""
            }`}
            data-predictive-ready={
              predictiveWarmMailId &&
              selectedMail?.id === predictiveWarmMailId
                ? "true"
                : undefined
            }
            onMouseMove={handleFocusMouseMove}
            onMouseLeave={handleFocusMouseLeave}
          >
            {selectedMail ? (
              <div
                key={selectedMailId}
                className="reply-panel-stack flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
              >
                <div className="mail-view right-flow-block client-block glass-panel glass-depth-2 shrink-0">
                  <div className="mail-reading-header-row flex items-start justify-between gap-2 mb-2 min-w-0">
                    <div className="mail-header min-w-0 flex-1">{selectedMail.title}</div>
                    <div
                      className="mail-reading-meta-icons shrink-0 flex items-center gap-1.5"
                      aria-label="Message signals"
                    >
                      {OPENMAIL_DEMO_MODE ? (
                        (() => {
                          const t = openMailThreatPresentation(selectedMail);
                          return (
                            <div
                              className={`mail-threat-badge mail-threat-badge--${t.variant}`}
                              aria-label={`Threat level ${t.label}, score ${t.score}`}
                            >
                              <span>{t.label}</span>
                              <span className="mail-threat-badge__score">
                                {t.score}
                              </span>
                            </div>
                          );
                        })()
                      ) : null}
                      <button
                        type="button"
                        className="mail-reading-ai-chip"
                        title="AI Insight"
                        aria-label="Open AI Insight"
                        onClick={() => openAiInsightPanel(selectedMail)}
                      >
                        <span className="mail-reading-ai-chip__label">AI</span>
                      </button>
                      {(selectedMail.attachments?.length ?? 0) > 0 ? (
                        <span
                          className="mail-card-meta-icon mail-reading-meta-icon"
                          title="Has attachments"
                          aria-hidden
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        </span>
                      ) : null}
                      {mailContainsDetectableUrls(selectedMail) ? (
                        <span
                          className="mail-card-meta-icon mail-reading-meta-icon"
                          title="Contains links"
                          aria-hidden
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
                            <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mail-subject">{selectedMail.subject}</div>
                  <div className="text-[11px] opacity-70 mb-2">
                    From: {selectedMail.sender ?? selectedMail.title} ·{" "}
                    {new Date(selectedMail.date ?? Date.now()).toLocaleString()}
                  </div>
                  {threadMessages.length > 1 ? (
                    <div className="thread-view-panel">
                      <div className="thread-view-title">Thread ({threadMessages.length})</div>
                      <div className="thread-view-list">
                        {threadMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`thread-view-item ${
                              msg.id === selectedMail.id ? "active" : ""
                            }`}
                          >
                            <div className="thread-view-meta">
                              <span>{msg.sender ?? msg.title}</span>
                              <span>{new Date(msg.date ?? "").toLocaleString()}</span>
                            </div>
                            <div className="thread-view-content">{msg.content || msg.preview}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mail-detail-actions flex flex-wrap items-center gap-4 mt-2 mb-2">
                    <button
                      type="button"
                      className="mail-detail-action-btn button magnetic-ui button-liquid flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider border border-white/10 bg-white/5"
                      onClick={() => mockScheduleMail(selectedMail.id)}
                      title="Schedule (mock)"
                    >
                      <OpenMailIcon name="calendar" size={14} alt="" />
                      Schedule
                    </button>
                    <button
                      type="button"
                      className="mail-detail-action-btn button magnetic-ui button-liquid flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider border border-white/10 bg-white/5"
                      onClick={() => softDeleteMail(selectedMail.id)}
                      title="Delete"
                    >
                      <OpenMailIcon name="delete" size={14} alt="" />
                      Delete
                    </button>
                    <button
                      type="button"
                      className="mail-detail-action-btn button magnetic-ui button-liquid flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider border border-white/10 bg-white/5"
                      onClick={() => openReplyCompose(selectedMail)}
                      title="Reply"
                    >
                      <OpenMailIcon name="reply" size={14} alt="" />
                      Reply
                    </button>
                  </div>
                  <div className="mail-body">
                    <EmailBodyWithLinks
                      content={selectedMail.content}
                      mail={selectedMail}
                      mailId={selectedMail.id}
                    />
                  </div>
                  {selectedMail.attachments && selectedMail.attachments.length > 0 ? (
                    <MailAttachments
                      mail={selectedMail}
                      attachments={selectedMail.attachments}
                    />
                  ) : null}
                </div>

                <div
                  className={`ai-panel ai-reply-panel-shell right-flow-block glass-panel glass-depth-2 control-block flex min-h-0 flex-1 flex-col gap-4 overflow-hidden ${isAutoReady ? "auto-ready" : ""}`}
                >
                  <h3 className="ai-section-title shrink-0 text-[10px] uppercase tracking-wider">
                    AI Reply
                  </h3>
                  <p className="text-[10px] text-white/45 leading-snug shrink-0 -mt-1">
                    Suggested replies below — read the full message in the column on the left.
                  </p>
                  <div className="ai-reply-panel-top shrink-0 space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="reply-intent-input"
                        className="text-[11px] font-medium text-white/60 tracking-wide"
                      >
                        What do you want to say?
                      </label>
                      <textarea
                        id="reply-intent-input"
                        className="reply-input w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/20"
                        rows={2}
                        value={replyIntent}
                        onChange={(e) => setReplyIntent(e.target.value)}
                        placeholder="What should the reply do? (e.g. confirm, decline, ask for details)"
                      />
                    </div>
                    <details className="refine-block">
                      <summary>Add context (optional)</summary>
                      <textarea
                        id="reply-optional-draft"
                        className="reply-input refine-input w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/20"
                        rows={2}
                        value={replyOptionalDraft}
                        onChange={(e) => setReplyOptionalDraft(e.target.value)}
                        placeholder="Add context, constraints, or tone tweaks..."
                        aria-label="Optional context for the reply"
                      />
                    </details>
                  </div>
                  <div className="ai-reply-content space-y-4">
                    <button
                      type="button"
                      className="w-full text-left text-[10px] uppercase tracking-wider text-white/65 hover:text-white/90 py-1 border border-transparent rounded-lg hover:bg-white/5 px-1 -mx-1 transition-colors"
                      onClick={() => setShowWhyThisReply((open) => !open)}
                      aria-expanded={showWhyThisReply}
                    >
                      {showWhyThisReply ? "▼ Why this reply?" : "▶ Why this reply?"}
                    </button>
                    {showWhyThisReply ? (
                      <div
                        className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-[11px] leading-relaxed text-white/80 whitespace-pre-wrap"
                        role="region"
                        aria-label="Why this reply"
                      >
                        {whyThisReplyExplanation || "—"}
                      </div>
                    ) : null}
                    <div className="ai-reply-generated space-y-4">
                      <p className="text-[9px] uppercase text-white/40 tracking-[0.2em]">
                        Auto-generated
                      </p>
                      <p className="text-[10px] uppercase text-white/55 tracking-widest">
                        Ready to send
                      </p>
                      <div className="suggestion-row">
                        {suggestions.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`suggestion-chip ${
                              i === selectedSuggestionIndex ? "active" : ""
                            }`}
                            onClick={() => selectSuggestion(i)}
                          >
                            {(["Best", "Alternative", "Short"] as const)[i] ??
                              `Option ${i + 1}`}
                          </button>
                        ))}
                      </div>
                      <textarea
                        key={selectedMail.id}
                        className="mail-reply reply-input tone-reply-input ai-reply-main-textarea"
                        value={aiReply}
                        placeholder="Generating reply..."
                        onChange={(event) => {
                          cancelReplyTyping();
                          const v = event.target.value;
                          setBaseReply(v);
                          setAiReply(v);
                          setSuggestions([v]);
                          replyVariantSeedsRef.current = [v];
                        }}
                        style={{
                          resize: "vertical",
                          minHeight: "120px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  <div className="ai-reply-panel-bottom shrink-0 space-y-4 pt-1">
                    <div className="tone-chip-row tone-actions grid grid-cols-2 gap-2 w-full">
                      {toneOptions.slice(0, 4).map((tone) => {
                        const isActive = committedTone === tone;
                        return (
                          <button
                            key={tone}
                            type="button"
                            className={`tone-chip button magnetic-ui button-liquid weave-energy px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] uppercase hover:bg-white/10 transition-all ${isActive ? "active" : ""}`}
                            onClick={() => commitTone(tone)}
                          >
                            {tone}
                          </button>
                        );
                      })}
                    </div>
                    <div className="schedule-container">
                      <button
                        type="button"
                        className="mail-send-btn button magnetic-ui button-liquid weave-focus"
                        onClick={handleSend}
                        onMouseMove={handleFocusMouseMove}
                        onMouseLeave={handleFocusMouseLeave}
                      >
                        Send reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mail-view glass-panel glass-depth-2">
                {!storedAccount && !OPENMAIL_DEMO_MODE ? (
                  <>
                    <div className="mail-subject">System ready. Awaiting connection.</div>
                    <div className="mail-body mb-4">
                      Add an account to read and send mail from OpenMail.
                    </div>
                    <button
                      type="button"
                      className="mail-send-btn openmail-empty-state-btn button magnetic-ui button-liquid weave-focus text-[11px] uppercase"
                      onClick={() => setAccountModalOpen(true)}
                    >
                      Add account
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mail-subject">Select a message</div>
                    <div className="mail-body">Choose a mail from the list to preview full content.</div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
      </div>
      </div>

      {(() => {
        const insightMail =
          aiInsightPanelMailId != null
            ? processedMails.find((m) => m.id === aiInsightPanelMailId)
            : undefined;
        if (!insightMail) return null;
        const insightRisk = getRiskPresentation(insightMail.securityLevel);
        return (
          <>
            <div
              className="ai-insight-backdrop"
              aria-hidden
              onClick={(event) => {
                event.stopPropagation();
                closeAiInsightPanel();
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-insight-title"
              className={`ai-insight-panel glass-panel glass-depth-2 ai-insight-panel--modal-center ai-insight-panel--${insightRisk.tier} ${activeThemeClass}`}
              data-theme={legacyThemeMode}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="ai-insight-panel-header">
                <h3 id="ai-insight-title" className="ai-insight-panel-title">
                  AI INSIGHT
                </h3>
                <button
                  type="button"
                  className="ai-insight-panel-close"
                  aria-label="Close AI insight"
                  onClick={closeAiInsightPanel}
                >
                  ×
                </button>
              </div>
              {insightMail.securityReason || insightMail.securityAiSubline ? (
                <div className="ai-insight-reason-block">
                  {insightMail.securityReason ? (
                    <p className="ai-insight-reason-primary">
                      {insightMail.securityReason}
                    </p>
                  ) : null}
                  {insightMail.securityAiSubline ? (
                    <p className="ai-insight-reason-ai">
                      {insightMail.securityAiSubline}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ul className="ai-insight-panel-list">
                {insightMail.securityWhyBullets.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <div className="ai-insight-mail-body-preview">
                <div className="ai-insight-mail-body-label">Message</div>
                <div className="ai-insight-mail-body-scroll">
                  <EmailBodyWithLinks
                    content={insightMail.content}
                    mail={insightMail}
                    mailId={insightMail.id}
                  />
                </div>
                {insightMail.attachments && insightMail.attachments.length > 0 ? (
                  <MailAttachments
                    mail={insightMail}
                    attachments={insightMail.attachments}
                  />
                ) : null}
              </div>
            </div>
          </>
        );
      })()}

      {linkThreatFlash ? (
        <div className="god-link-threat-overlay" aria-hidden />
      ) : null}

      {linkDefenseToast ? (
        <div className="link-defense-toast" role="status" aria-live="polite">
          {linkDefenseToast}
        </div>
      ) : null}

      {accountModalOpen ? (
        <>
          <div
            className="ai-insight-backdrop"
            aria-hidden
            onClick={() => setAccountModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            className="openmail-account-modal glass-panel glass-depth-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-modal-head flex items-center justify-between gap-3 mb-4">
              <h2 id="account-modal-title" className="text-sm font-semibold tracking-wide uppercase">
                Add account
              </h2>
              <button
                type="button"
                className="ai-insight-panel-close"
                aria-label="Close"
                onClick={() => setAccountModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="text-[11px] opacity-60 mb-4 leading-relaxed">
              Connect with auto-detection first. If needed, manual IMAP/SMTP stays available and is
              saved only on this device.
            </p>
            <div className="openmail-form-grid flex flex-col gap-3 text-[12px]">
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Email</span>
                <input
                  type="email"
                  className="openmail-input"
                  value={setupEmail}
                  onChange={(e) => {
                    const email = e.target.value.trim();
                    setSetupEmail(email);
                    setAccountDraft((d) => applyProviderConfigFromEmail(d, email));
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Password</span>
                <input
                  type="password"
                  className="openmail-input"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="button magnetic-ui button-liquid px-3 py-2 text-[11px] uppercase weave-focus flex items-center justify-center gap-2"
                onClick={() => void connectAccount("auto")}
                disabled={accountConnectStep === "loading"}
              >
                <OpenMailIcon name="sync" size={14} alt="" />
                Connect
              </button>
              {accountConnectStep === "loading" ? (
                <div className="text-[11px] opacity-80 animate-pulse">{accountConnectHint}</div>
              ) : null}
              {accountConnectError ? (
                <div className="text-[11px] opacity-80">{accountConnectError}</div>
              ) : null}

              {accountConnectStep === "manual" ? (
                <>
                  <div className="text-[10px] uppercase tracking-wider opacity-50 mt-1">
                    Manual fallback
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="opacity-70 text-[10px] uppercase tracking-wider">Display name</span>
                    <input
                      className="openmail-input"
                      value={accountDraft.label}
                      onChange={(e) =>
                        setAccountDraft((d) => ({ ...d, label: e.target.value }))
                      }
                    />
                  </label>
              <p className="text-[10px] opacity-55 leading-relaxed -mt-1">
                Provider presets auto-fill IMAP/SMTP for Gmail, Outlook, and Yahoo. You can manually
                override any field.
              </p>
              <div className="text-[10px] uppercase tracking-wider opacity-50 mt-1">IMAP</div>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Host</span>
                <input
                  className="openmail-input"
                  value={accountDraft.imap.host}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      imap: { ...d.imap, host: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="opacity-70 text-[10px] uppercase tracking-wider">Port</span>
                  <input
                    type="number"
                    className="openmail-input"
                    value={accountDraft.imap.port}
                    onChange={(e) =>
                      setAccountDraft((d) => ({
                        ...d,
                        imap: { ...d.imap, port: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="opacity-70 text-[10px] uppercase tracking-wider">Security</span>
                  <select
                    className="openmail-input"
                    value={accountDraft.imap.security}
                    onChange={(e) =>
                      setAccountDraft((d) => ({
                        ...d,
                        imap: {
                          ...d.imap,
                          security: e.target.value as OpenMailAccountProfile["imap"]["security"],
                        },
                      }))
                    }
                  >
                    <option value="ssl">SSL</option>
                    <option value="tls">TLS</option>
                    <option value="none">None</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">IMAP user</span>
                <input
                  className="openmail-input"
                  value={accountDraft.imap.username}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      imap: { ...d.imap, username: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">IMAP password</span>
                <input
                  type="password"
                  className="openmail-input"
                  value={accountDraft.imap.password || setupPassword}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      imap: { ...d.imap, password: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="text-[10px] uppercase tracking-wider opacity-50 mt-1">SMTP</div>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Host</span>
                <input
                  className="openmail-input"
                  value={accountDraft.smtp.host}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      smtp: { ...d.smtp, host: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="opacity-70 text-[10px] uppercase tracking-wider">Port</span>
                  <input
                    type="number"
                    className="openmail-input"
                    value={accountDraft.smtp.port}
                    onChange={(e) =>
                      setAccountDraft((d) => ({
                        ...d,
                        smtp: { ...d.smtp, port: Number(e.target.value) || 0 },
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="opacity-70 text-[10px] uppercase tracking-wider">Security</span>
                  <select
                    className="openmail-input"
                    value={accountDraft.smtp.security}
                    onChange={(e) =>
                      setAccountDraft((d) => ({
                        ...d,
                        smtp: {
                          ...d.smtp,
                          security: e.target.value as OpenMailAccountProfile["smtp"]["security"],
                        },
                      }))
                    }
                  >
                    <option value="ssl">SSL</option>
                    <option value="tls">TLS</option>
                    <option value="none">None</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">SMTP user</span>
                <input
                  className="openmail-input"
                  value={accountDraft.smtp.username}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      smtp: { ...d.smtp, username: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">SMTP password</span>
                <input
                  type="password"
                  className="openmail-input"
                  value={accountDraft.smtp.password || setupPassword}
                  onChange={(e) =>
                    setAccountDraft((d) => ({
                      ...d,
                      smtp: { ...d.smtp, password: e.target.value },
                    }))
                  }
                />
              </label>
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                className="button magnetic-ui button-liquid px-3 py-2 text-[11px] uppercase"
                onClick={() => setAccountModalOpen(false)}
              >
                Cancel
              </button>
              {accountConnectStep === "manual" ? (
                <button
                  type="button"
                  className="button magnetic-ui button-liquid px-3 py-2 text-[11px] uppercase weave-focus flex items-center gap-2"
                  onClick={() => void connectAccount("manual")}
                  disabled={accountConnectStep === "loading" || !isAccountConfigured(accountDraft)}
                >
                  <OpenMailIcon name="sync" size={14} alt="" />
                  Connect manually
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {featureWipModal ? (
        <>
          <div
            className="ai-insight-backdrop"
            aria-hidden
            onClick={() => setFeatureWipModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-wip-modal-title"
            className="openmail-account-modal glass-panel glass-depth-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-modal-head flex items-center justify-between gap-3 mb-4">
              <h2
                id="feature-wip-modal-title"
                className="text-sm font-semibold tracking-wide uppercase"
              >
                Feature in progress
              </h2>
              <button
                type="button"
                className="ai-insight-panel-close"
                aria-label="Close"
                onClick={() => setFeatureWipModal(null)}
              >
                ×
              </button>
            </div>
            <p className="text-[12px] opacity-70 leading-relaxed">
              Contacts and Calendar integration are currently in development. These features will be
              available in upcoming releases.
            </p>
            <button
              type="button"
              className="button magnetic-ui button-liquid mt-4 px-3 py-2 text-[11px] uppercase"
              onClick={() => setFeatureWipModal(null)}
            >
              Close
            </button>
          </div>
        </>
      ) : null}

      {settingsModalOpen ? (
        <>
          <div
            className="ai-insight-backdrop"
            aria-hidden
            onClick={() => setSettingsModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            className="openmail-account-modal glass-panel glass-depth-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-modal-head flex items-center justify-between gap-3 mb-4">
              <h2 id="settings-modal-title" className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                <OpenMailIcon name="settings" size={18} alt="" />
                Settings
              </h2>
              <button
                type="button"
                className="ai-insight-panel-close"
                aria-label="Close"
                onClick={() => setSettingsModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="text-[12px] opacity-70 leading-relaxed">
              Desktop build, themes, and sync preferences will plug in here. IMAP/SMTP lives under
              Accounts.
            </p>
            <button
              type="button"
              className="button magnetic-ui button-liquid mt-4 px-3 py-2 text-[11px] uppercase"
              onClick={() => setSettingsModalOpen(false)}
            >
              Close
            </button>
          </div>
        </>
      ) : null}

      {composeModalOpen ? (
        <>
          <div
            className="ai-insight-backdrop"
            aria-hidden
            onClick={() => setComposeModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-modal-title"
            className="openmail-account-modal glass-panel glass-depth-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="openmail-modal-head flex items-center justify-between gap-3 mb-4">
              <h2 id="compose-modal-title" className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                <OpenMailIcon name="draft" size={16} alt="" />
                Compose
              </h2>
              <button
                type="button"
                className="ai-insight-panel-close"
                aria-label="Close"
                onClick={() => setComposeModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="openmail-form-grid flex flex-col gap-3 text-[12px]">
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">To</span>
                <input
                  type="email"
                  className="openmail-input"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Subject</span>
                <input
                  className="openmail-input"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">Message</span>
                <textarea
                  className="openmail-input"
                  style={{ minHeight: "140px", resize: "vertical" }}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                className="button magnetic-ui button-liquid px-3 py-2 text-[11px] uppercase"
                onClick={handleComposeSaveDraft}
                disabled={composeSending}
              >
                Save Draft
              </button>
              <button
                type="button"
                className="button magnetic-ui button-liquid px-3 py-2 text-[11px] uppercase weave-focus flex items-center gap-2"
                onClick={() => void handleComposeSend()}
                disabled={composeSending}
              >
                <OpenMailIcon name="send" size={14} alt="" />
                {composeSending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {openedMail && (
        <div
          className="mail-fullscreen-overlay"
          onClick={closeOpenedMail}
          style={{
            opacity: isMailFullscreenOpen ? 1 : 0,
            transition: "opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            className="mail-fullscreen-panel"
            onClick={(event) => event.stopPropagation()}
            style={
              openedMailRect
                ? ({
                    position: "fixed",
                    top: isMailFullscreenOpen ? "50%" : `${openedMailRect.top}px`,
                    left: isMailFullscreenOpen ? "50%" : `${openedMailRect.left}px`,
                    width: isMailFullscreenOpen ? "min(960px, 94vw)" : `${openedMailRect.width}px`,
                    height: isMailFullscreenOpen ? "88vh" : `${openedMailRect.height}px`,
                    maxHeight: "88vh",
                    transform: isMailFullscreenOpen
                      ? "translate(-50%, -50%) scale(1)"
                      : "translate(0, 0) scale(1)",
                    transition:
                      "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1), left 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                  } as CSSProperties)
                : undefined
            }
          >
            <h2>{openedMail.subject}</h2>
            <p>{openedMail.sender ?? openedMail.title}</p>
            <div className="mail-fullscreen-content">
              <EmailBodyWithLinks
                content={openedMail.content}
                mail={openedMail}
                mailId={openedMail.id}
              />
              {openedMail.attachments && openedMail.attachments.length > 0 ? (
                <MailAttachments
                  mail={openedMail}
                  attachments={openedMail.attachments}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
    </OpenmailSecurityProvider>
  );
}
