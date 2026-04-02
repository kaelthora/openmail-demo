"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type OpenmailToastVariant = "success" | "error" | "info";

type ToastItem = { id: number; message: string; variant: OpenmailToastVariant };

type ToastContextValue = {
  toast: (message: string, variant?: OpenmailToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_MS = 4200;

export function OpenmailToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: OpenmailToastVariant = "info") => {
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-2), { id, message, variant }]);
      const t = setTimeout(() => remove(id), TOAST_MS);
      timers.current.set(id, t);
    },
    [remove]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="openmail-toast-region pointer-events-none fixed bottom-4 right-4 z-[400] flex max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`openmail-toast pointer-events-auto openmail-toast--${t.variant}`}
            role="status"
          >
            <span className="openmail-toast-message">{t.message}</span>
            <button
              type="button"
              className="openmail-toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => remove(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useOpenmailToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useOpenmailToast must be used within OpenmailToastProvider");
  }
  return ctx;
}
