"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolved: "light",
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "ledra_theme";
const COOKIE_KEY = "__theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", resolved);
  // Set cookie for SSR flash prevention
  document.cookie = `${COOKIE_KEY}=${resolved};path=/;max-age=31536000;SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Initialize from localStorage (client-only; SSR keeps "system" to avoid
  // hydration mismatch — the real theme is already applied to <html> by the
  // inline THEME_INIT_SCRIPT in RootLayout).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve + apply theme, and (only in system mode) subscribe to OS changes.
  // Merged into one effect so we don't double-commit on every mode change.
  useEffect(() => {
    const resolvedTheme = mode === "system" ? getSystemTheme() : mode;
    setResolved(resolvedTheme);
    applyTheme(resolvedTheme);

    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const r = e.matches ? "dark" : "light";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
