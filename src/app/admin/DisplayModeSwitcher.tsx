"use client";

import { useEffect, useState } from "react";
import { type DisplayMode, type PreferenceScope, useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";

const MODES: { id: DisplayMode; label: string; shortLabel: string }[] = [
  { id: "simple", label: "かんたん表示", shortLabel: "かんたん" },
  { id: "standard", label: "標準表示", shortLabel: "標準" },
  { id: "dense", label: "一覧重視", shortLabel: "一覧" },
];

export default function DisplayModeSwitcher() {
  const { displayMode, deviceOverride, setDisplayMode, clearDeviceOverride, restartOnboarding } = useUiPreferences();
  const [scopeChoice, setScopeChoice] = useState<PreferenceScope | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const scope = scopeChoice ?? (deviceOverride ? "device" : "account");

  useEffect(() => {
    if (!message || messageIsError) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message, messageIsError]);

  async function choose(mode: DisplayMode) {
    if (mode === displayMode && !(scope === "account" && deviceOverride)) return;
    setSaving(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      await setDisplayMode(mode, scope);
      setMessage(scope === "device" ? "この端末の表示を変更しました" : "表示を変更しました");
    } catch (error: unknown) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "表示を変更できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex items-center gap-1.5" aria-label="表示切り替え">
      <div className="inline-flex rounded-xl bg-inset p-1" role="group" aria-label="表示方法">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={displayMode === mode.id}
            disabled={saving}
            onClick={() => choose(mode.id)}
            className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3 ${
              displayMode === mode.id ? "bg-surface text-accent shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            <span className="sm:hidden">{mode.shortLabel}</span>
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        ))}
      </div>

      <details className="group relative">
        <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-border-default px-2.5 text-xs font-semibold whitespace-nowrap text-secondary transition-colors hover:bg-inset hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span className="hidden sm:inline">表示設定</span>
          <span className="text-base leading-none sm:hidden" aria-hidden="true">
            ⋯
          </span>
        </summary>
        <div className="absolute top-[calc(100%+0.5rem)] right-0 z-30 w-64 rounded-xl border border-border-default bg-surface p-3 text-xs shadow-lg">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-primary">
            <input
              type="checkbox"
              checked={scope === "device"}
              onChange={(event) => setScopeChoice(event.target.checked ? "device" : "account")}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            この端末だけ表示を変更
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            オフの場合は、同じアカウントのWeb・モバイルへ反映します。
          </p>
          {deviceOverride && (
            <button
              type="button"
              onClick={() => {
                clearDeviceOverride();
                setScopeChoice("account");
              }}
              className="mt-3 min-h-9 w-full rounded-lg bg-inset px-3 font-semibold text-accent hover:bg-border-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              共通設定に戻す
            </button>
          )}
        </div>
      </details>

      <button
        type="button"
        aria-label="表示の選び方を確認"
        title="表示の選び方を確認"
        onClick={() => void restartOnboarding()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-default text-sm font-bold text-secondary transition-colors hover:bg-inset hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ?
      </button>

      {message && (
        <p
          className={`absolute top-[calc(100%+0.5rem)] right-0 z-20 rounded-lg border border-border-default bg-surface px-3 py-2 text-[11px] whitespace-nowrap shadow-md ${
            messageIsError ? "text-danger-text" : "text-secondary"
          }`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
