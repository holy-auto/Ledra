"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: "border-l-[3px] border-l-[var(--accent-emerald)]",
  error: "border-l-[3px] border-l-[var(--accent-red)]",
  warning: "border-l-[3px] border-l-[var(--accent-amber)]",
  info: "border-l-[3px] border-l-[var(--accent-blue)]",
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-emerald)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-red)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-amber)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4m0 4h.01M10.29 3.86l-8.58 14.87a2 2 0 001.72 3h17.14a2 2 0 001.72-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-blue)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4m0-4h.01" />
    </svg>
  ),
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 left-4 right-4 z-50 space-y-2 sm:left-auto sm:right-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            aria-live="assertive"
            className={`flex w-full items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-solid)] px-4 py-3 shadow-lg sm:max-w-sm ${VARIANT_BORDER[t.variant]}`}
            style={{ animation: "toast-in 200ms var(--ease-spring)" }}
          >
            {VARIANT_ICON[t.variant]}
            <span className="flex-1 text-sm text-primary">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-primary transition-colors"
              aria-label="閉じる"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
