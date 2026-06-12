"use client";

import { useState, useEffect, useCallback } from "react";

// ─── 型定義 ──────────────────────────────────────────────────────
interface FollowUpSettings {
  enabled: boolean;
  reminder_days_before: number[];
  follow_up_days_after: number[];
  maintenance_reminder_months: number[];
  seasonal_enabled: boolean;
}

const DEFAULTS: FollowUpSettings = {
  enabled: true,
  reminder_days_before: [30, 7, 1],
  follow_up_days_after: [90, 180],
  maintenance_reminder_months: [6, 12],
  seasonal_enabled: false,
};

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── トグルスイッチ ───────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-accent" : "bg-border-strong"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-inverse rounded-full shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ─── タグ形式の数値リスト編集 ───────────────────────────────────────
function NumberTagList({
  values,
  unit,
  onChange,
  disabled,
  min = 1,
  max = 120,
}: {
  values: number[];
  unit: string;
  onChange: (next: number[]) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < min || n > max) return;
    if (values.includes(n)) {
      setDraft("");
      return;
    }
    onChange([...values, n].sort((a, b) => a - b));
    setDraft("");
  }

  function remove(n: number) {
    onChange(values.filter((v) => v !== n));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.length === 0 ? (
          <span className="text-xs text-muted italic py-1">未設定</span>
        ) : (
          values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-dim text-accent-text text-sm font-medium"
            >
              {v}
              {unit}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="text-accent-text/70 hover:text-accent-text"
                  aria-label={`${v}${unit}を削除`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={draft}
            min={min}
            max={max}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={`${min}〜${max}`}
            className={`w-24 ${inputCls}`}
          />
          <span className="text-sm text-muted">{unit}</span>
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 px-3 py-1.5 bg-inset hover:bg-surface-active rounded-lg text-sm font-medium text-primary transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            追加
          </button>
        </div>
      )}
    </div>
  );
}

// ─── セクションカード ─────────────────────────────────────────────
function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
      <h3 className="text-base font-semibold text-primary mb-1">{title}</h3>
      <p className="text-xs text-secondary mb-4">{description}</p>
      {children}
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function FollowUpSettingsClient() {
  const [settings, setSettings] = useState<FollowUpSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/follow-up-settings");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const s = data.settings ?? {};
      setSettings({
        enabled: s.enabled ?? DEFAULTS.enabled,
        reminder_days_before: Array.isArray(s.reminder_days_before)
          ? s.reminder_days_before
          : DEFAULTS.reminder_days_before,
        follow_up_days_after: Array.isArray(s.follow_up_days_after)
          ? s.follow_up_days_after
          : DEFAULTS.follow_up_days_after,
        maintenance_reminder_months: Array.isArray(s.maintenance_reminder_months)
          ? s.maintenance_reminder_months
          : DEFAULTS.maintenance_reminder_months,
        seasonal_enabled: s.seasonal_enabled ?? DEFAULTS.seasonal_enabled,
      });
    } catch (e) {
      console.error(e);
      showToast("error", "設定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function patch<K extends keyof FollowUpSettings>(key: K, value: FollowUpSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/follow-up-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("save failed");
      showToast("success", "設定を保存しました");
    } catch (e) {
      console.error(e);
      showToast("error", "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const disabled = !settings.enabled;

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">フォローアップ設定</h1>
          <p className="text-sm text-secondary mt-1">有効期限リマインダー・施工後フォロー・メンテ案内の自動送信を設定します</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>

      <div className="space-y-5">
        {/* 1. 有効化 */}
        <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary">フォローアップ有効化</h3>
            <p className="text-xs text-secondary mt-1">オフにすると自動フォローはすべて停止します</p>
          </div>
          <Toggle on={settings.enabled} onChange={(v) => patch("enabled", v)} />
        </div>

        <div className={disabled ? "opacity-50 pointer-events-none space-y-5" : "space-y-5"}>
          {/* 2. 有効期限前リマインダー */}
          <SettingCard
            title="有効期限前リマインダー"
            description="証明書・保証の有効期限が近づいた顧客へ事前にお知らせします"
          >
            <NumberTagList
              values={settings.reminder_days_before}
              unit="日前"
              max={365}
              onChange={(v) => patch("reminder_days_before", v)}
              disabled={disabled}
            />
          </SettingCard>

          {/* 3. 施工後フォローアップ */}
          <SettingCard title="施工後フォローアップ" description="施工完了から一定日数後に状態確認・ご案内を送信します">
            <NumberTagList
              values={settings.follow_up_days_after}
              unit="日後"
              max={365}
              onChange={(v) => patch("follow_up_days_after", v)}
              disabled={disabled}
            />
          </SettingCard>

          {/* 4. メンテナンスリマインダー */}
          <SettingCard title="メンテナンスリマインダー" description="定期メンテナンスの時期に合わせてリマインドします">
            <NumberTagList
              values={settings.maintenance_reminder_months}
              unit="ヶ月後"
              max={120}
              onChange={(v) => patch("maintenance_reminder_months", v)}
              disabled={disabled}
            />
          </SettingCard>

          {/* 5. 季節提案 */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-primary">季節提案</h3>
              <p className="text-xs text-secondary mt-1">
                冬前（10〜11月）・梅雨前（5〜6月）に季節向けメニューを提案します
              </p>
            </div>
            <Toggle on={settings.seasonal_enabled} onChange={(v) => patch("seasonal_enabled", v)} />
          </div>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 z-50 ${
            toast.type === "success" ? "bg-accent text-white" : "bg-danger text-white"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
