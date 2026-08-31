"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type DisplayMode, useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";

type WorkRole = "reception" | "technician" | "manager" | "owner";

const ROLE_OPTIONS: { id: WorkRole; label: string }[] = [
  { id: "reception", label: "受付・予約" },
  { id: "technician", label: "施工・作業" },
  { id: "manager", label: "店舗管理" },
  { id: "owner", label: "経営・管理" },
];

const MODE_OPTIONS: { id: DisplayMode; label: string; description: string }[] = [
  { id: "simple", label: "かんたん表示", description: "次にすることを大きく案内" },
  { id: "standard", label: "標準表示", description: "案内と一覧をバランスよく表示" },
  { id: "dense", label: "一覧重視", description: "多くの案件を一度に確認" },
];

export default function DisplayModeOnboarding() {
  const { displayMode, loading, onboardingCompleted, completeOnboarding } = useUiPreferences();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<WorkRole | null>(null);
  const [mode, setMode] = useState<DisplayMode>("standard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const recommendation = useMemo<DisplayMode>(() => {
    if (role === "owner") return "dense";
    if (role === "reception" || role === "manager") return "standard";
    return "simple";
  }, [role]);

  useEffect(() => {
    const open = !loading && !onboardingCompleted;
    if (open && !wasOpen.current) {
      setStep(0);
      setRole(null);
      setMode(displayMode);
      setError(null);
    }
    wasOpen.current = open;
  }, [displayMode, loading, onboardingCompleted]);

  if (loading || onboardingCompleted) return null;

  function nextFromRole() {
    if (!role) return;
    setMode(recommendation);
    setStep(1);
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding(mode);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "設定を保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  async function startWithStandard() {
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding("standard");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "設定を保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="display-onboarding-title"
        className="flex max-h-[calc(100dvh-0.75rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-7 sm:pt-7">
          <div>
            <p className="text-xs font-semibold text-accent">初回設定 {step + 1} / 3</p>
            <h2 id="display-onboarding-title" className="mt-1 text-2xl font-bold text-primary">
              {step === 0
                ? "主に担当する仕事を教えてください"
                : step === 1
                  ? "見やすい表示を選びます"
                  : "この表示で始めます"}
            </h2>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void startWithStandard()}
            className="min-h-10 shrink-0 px-2 text-xs font-semibold text-muted hover:text-primary"
          >
            標準で始める
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-7">
          {step === 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => {
                const selected = role === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRole(option.id)}
                    className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border p-4 text-left text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      selected
                        ? "border-accent bg-accent-dim text-primary ring-2 ring-accent/20"
                        : "border-border-default bg-base text-primary hover:border-accent/50"
                    }`}
                  >
                    <span>{option.label}</span>
                    {selected && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-inverse">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  onClick={() => setMode(option.id)}
                  className={`flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    mode === option.id
                      ? "border-accent bg-accent-dim ring-2 ring-accent/20"
                      : "border-border-default bg-base hover:border-accent/50"
                  }`}
                >
                  <span>
                    <span className="block font-bold text-primary">{option.label}</span>
                    <span className="mt-1 block text-sm text-secondary">{option.description}</span>
                  </span>
                  {option.id === recommendation && (
                    <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-inverse">
                      おすすめ
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="rounded-2xl border border-border-default bg-base p-5">
              <p className="text-sm text-secondary">選択した表示</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {MODE_OPTIONS.find((option) => option.id === mode)?.label}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden="true">
                <div className="col-span-3 h-3 rounded-full bg-accent/25" />
                <div className="h-16 rounded-xl bg-accent/15" />
                <div className="h-16 rounded-xl bg-warning/15" />
                <div className="h-16 rounded-xl bg-success/15" />
              </div>
              <p className="mt-4 text-sm leading-6 text-secondary">
                表示はいつでも「表示切替」から変更できます。権限や保存されるデータは変わりません。
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-between gap-3 border-t border-border-subtle bg-surface px-5 py-4 sm:px-7 sm:py-5">
          <button
            type="button"
            disabled={step === 0 || saving}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="min-h-12 rounded-xl border border-border-default px-5 text-sm font-semibold text-secondary disabled:invisible"
          >
            戻る
          </button>
          {step < 2 ? (
            <button
              type="button"
              disabled={(step === 0 && !role) || saving}
              onClick={step === 0 ? nextFromRole : () => setStep(2)}
              className="min-h-12 rounded-xl bg-accent px-7 text-sm font-semibold text-inverse disabled:opacity-40"
            >
              次へ
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish()}
              className="min-h-12 rounded-xl bg-accent px-7 text-sm font-semibold text-inverse disabled:opacity-50"
            >
              {saving ? "保存中..." : "この表示で始める"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
