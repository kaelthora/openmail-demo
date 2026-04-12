"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { OPENMAIL_DEMO_MODE } from "@/lib/openmailDemo";
import { readDismissedNotifyIds } from "@/lib/openmailNotifyDismissedIdb";
import {
  formatNotificationSummaryLines,
  formatSuggestedActionLine,
  notificationTitle,
} from "@/lib/openmailSmartNotificationCopy";
import { useOpenmailPreferences } from "./OpenmailPreferencesProvider";

const NOTIFY_MAX = 3;
const DEBOUNCE_MS = 450;

type NotifyItem = {
  id: string;
  subject: string | null;
  from: string | null;
  summary: string | null;
  action: string | null;
  reason: string | null;
  suggestions: string[];
  intent: string | null;
  intentUrgency: string | null;
  intentConfidence: number | null;
  risk: string | null;
  accountId: string | null;
};

type SmartNotificationsContextValue = {
  /** Request browser permission and register the notification worker (idempotent). */
  enableSmartNotifications: () => Promise<NotificationPermission | "unsupported">;
};

const SmartNotificationsContext =
  createContext<SmartNotificationsContextValue | null>(null);

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/openmail-notifications-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

function canUseNotifications(): boolean {
  if (typeof window === "undefined") return false;
  const isLocal =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return window.isSecureContext || isLocal;
}

export function SmartNotificationsProvider({ children }: { children: ReactNode }) {
  const { hydrated, display } = useOpenmailPreferences();
  const queueRef = useRef(new Set<string>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  const enableSmartNotifications = useCallback(async () => {
    if (!canUseNotifications()) return "unsupported";
    if (!("Notification" in window)) return "unsupported";
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      regRef.current = await ensureServiceWorker();
    }
    return perm;
  }, []);

  useEffect(() => {
    if (!hydrated || !display.smartNotifications || OPENMAIL_DEMO_MODE) return;
    if (!canUseNotifications()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    let cancelled = false;
    void (async () => {
      const reg = await ensureServiceWorker();
      if (!cancelled) regRef.current = reg;
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, display.smartNotifications]);

  useEffect(() => {
    if (!hydrated || !display.smartNotifications || OPENMAIL_DEMO_MODE) return;
    if (!canUseNotifications()) return;

    const flush = async () => {
      try {
      debounceRef.current = null;
      const raw = [...queueRef.current];
      queueRef.current.clear();
      if (raw.length === 0) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const dismissed = await readDismissedNotifyIds();
      const ids = raw.filter((id) => id && !dismissed.has(id)).slice(0, NOTIFY_MAX);
      if (ids.length === 0) return;

      let items: NotifyItem[] = [];
      try {
        const res = await fetch(
          `/api/emails/by-ids?ids=${encodeURIComponent(ids.join(","))}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as { items?: NotifyItem[] };
        items = Array.isArray(data.items) ? data.items : [];
      } catch {
        return;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";

      const reg = regRef.current ?? (await ensureServiceWorker());
      regRef.current = reg;

      for (const item of items) {
        const summary = formatNotificationSummaryLines(item.summary);
        const actionLine = formatSuggestedActionLine({
          intent: item.intent,
          action: item.action,
          suggestions: item.suggestions,
        });
        const body = `${summary}\n\n${actionLine}`;
        const title = notificationTitle(item.subject, item.from);
        const riskHigh = item.risk === "high";
        const hasSuggestion = (item.suggestions?.length ?? 0) > 0;
        const blocked =
          item.intent === "ignore" ||
          item.intent === "escalate" ||
          item.action === "ignore" ||
          item.action === "escalate";
        const explicitReply =
          item.intent === "reply" ||
          item.action === "reply" ||
          ((!item.intent || item.intent === "") &&
            (!item.action || item.action === "") &&
            hasSuggestion);
        const canQuick = !riskHigh && hasSuggestion && explicitReply && !blocked;

        const actions: { action: string; title: string }[] = [];
        if (canQuick) {
          actions.push({ action: "quick-send", title: "Quick send" });
        }
        actions.push({ action: "open", title: "Open" });
        actions.push({ action: "ignore", title: "Ignore" });

        try {
          if (reg && "showNotification" in reg) {
            await reg.showNotification(title, {
              body,
              tag: `openmail-${item.id}`,
              data: { mailId: item.id, origin },
              actions,
              icon: "/icons/inbox.svg",
            } as NotificationOptions);
          } else {
            new Notification(title, { body, tag: `openmail-${item.id}`, icon: "/icons/inbox.svg" });
          }
        } catch {
          /* quota / blocked */
        }
      }
      } catch {
        /* Swallow — notification pipeline must never stall the tab */
      }
    };

    const onNewMail = (ev: Event) => {
      const detail = (ev as CustomEvent<{ ids?: string[] }>).detail;
      const ids = Array.isArray(detail?.ids) ? detail.ids : [];
      for (const id of ids) {
        if (typeof id === "string" && id.trim()) queueRef.current.add(id.trim());
      }
      if (queueRef.current.size === 0) return;
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    };

    window.addEventListener("openmail-new-mail", onNewMail as EventListener);
    return () => {
      window.removeEventListener("openmail-new-mail", onNewMail as EventListener);
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, [hydrated, display.smartNotifications]);

  const value = useMemo(
    () => ({ enableSmartNotifications }),
    [enableSmartNotifications]
  );

  return (
    <SmartNotificationsContext.Provider value={value}>
      {children}
    </SmartNotificationsContext.Provider>
  );
}

export function useSmartNotifications(): SmartNotificationsContextValue {
  const ctx = useContext(SmartNotificationsContext);
  if (!ctx) {
    throw new Error("useSmartNotifications must be used within SmartNotificationsProvider");
  }
  return ctx;
}
