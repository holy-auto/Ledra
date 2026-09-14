"use client";

import { useTheme, type ThemeMode } from "./ThemeContext";

const MODES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "ライト",
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "ダーク",
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
        />
      </svg>
    ),
  },
  {
    value: "system",
    label: "自動",
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
        />
      </svg>
    ),
  },
];

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();

  if (compact) {
    // Cycle through modes on click
    const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    const current = MODES.find((m) => m.value === mode)!;
    return (
      <button
        onClick={() => setMode(next)}
        className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-hover hover:text-primary transition-all duration-150"
        title={`テーマ: ${current.label}`}
        type="button"
      >
        {current.icon}
        <span className="hidden sm:inline">{current.label}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-lg)] bg-[var(--bg-inset)] p-0.5">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150 ${
            mode === m.value ? "bg-[var(--bg-surface-solid)] text-primary shadow-sm" : "text-muted hover:text-secondary"
          }`}
          type="button"
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}
