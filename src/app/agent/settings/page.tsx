"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import type { BadgeVariant } from "@/lib/statusMaps";

interface AgentSettings {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  postal_code: string;
  address: string;
  role: string;
  stripe_connected: boolean;
  stripe_account_id: string | null;
  line_official_account_id: string | null;
  email_notifications: boolean;
}

const DEFAULT_SETTINGS: AgentSettings = {
  name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  postal_code: "",
  address: "",
  role: "member",
  stripe_connected: false,
  stripe_account_id: null,
  line_official_account_id: null,
  email_notifications: true,
};

export default function AgentSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [stripeLoading, setStripeLoading] = useState(false);

  const isAdmin = settings.role === "admin";

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/agent/login";
    });
  }, [supabase]);

  // Fetch settings
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/agent/settings");
        if (!res.ok) throw new Error("設定情報の取得に失敗しました");
        const json = await res.json();
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...json.settings });
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save settings
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.name,
          contact_name: settings.contact_name,
          contact_email: settings.contact_email,
          contact_phone: settings.contact_phone,
          postal_code: settings.postal_code,
          address: settings.address,
          email_notifications: settings.email_notifications,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "設定の保存に失敗しました");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  // Stripe Connect setup
  const handleStripeSetup = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/agent/stripe/connect", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Stripe Connect の設定に失敗しました");
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
      setStripeLoading(false);
    }
  }, []);

  // Stripe dashboard
  const handleStripeDashboard = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/agent/stripe/dashboard", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Stripe ダッシュボードへのアクセスに失敗しました");
      const json = await res.json();
      if (json.url) {
        window.open(json.url, "_blank");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setStripeLoading(false);
    }
  }, []);

  // Logout
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/agent/login";
  }, [supabase]);

  // Update field helper
  const updateField = <K extends keyof AgentSettings>(
    key: K,
    value: AgentSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Skeleton ── */
  const Skeleton = () => (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-6 animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-surface-hover" />
          <div className="h-10 w-full rounded bg-surface-hover" />
          <div className="h-10 w-full rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-1">
          <span className="section-tag">SETTINGS</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">
            設定
          </h1>
          <p className="text-[14px] text-secondary leading-relaxed">
            アカウント設定・連携情報の管理
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <>
          {/* Error / Success messages */}
          {error && (
            <div className="glass-card p-4">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}
          {saveSuccess && (
            <div className="glass-card p-4 border-success/30 bg-success-dim">
              <p className="text-sm text-success-text">設定を保存しました。</p>
            </div>
          )}

          {/* Profile section */}
          <section className="glass-card p-6 space-y-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              プロフィール
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted">エージェント名</span>
                {isAdmin ? (
                  <input
                    type="text"
                    value={settings.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.name || "-"}
                  </div>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">担当者名</span>
                {isAdmin ? (
                  <input
                    type="text"
                    value={settings.contact_name}
                    onChange={(e) => updateField("contact_name", e.target.value)}
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.contact_name || "-"}
                  </div>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">メールアドレス</span>
                {isAdmin ? (
                  <input
                    type="email"
                    value={settings.contact_email}
                    onChange={(e) => updateField("contact_email", e.target.value)}
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.contact_email || "-"}
                  </div>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">電話番号</span>
                {isAdmin ? (
                  <input
                    type="tel"
                    value={settings.contact_phone}
                    onChange={(e) => updateField("contact_phone", e.target.value)}
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.contact_phone || "-"}
                  </div>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">郵便番号</span>
                {isAdmin ? (
                  <input
                    type="text"
                    value={settings.postal_code}
                    onChange={(e) => updateField("postal_code", e.target.value)}
                    placeholder="000-0000"
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.postal_code || "-"}
                  </div>
                )}
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-muted">住所</span>
                {isAdmin ? (
                  <input
                    type="text"
                    value={settings.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className="input-field"
                  />
                ) : (
                  <div className="input-field bg-surface-hover/50 text-secondary cursor-not-allowed">
                    {settings.address || "-"}
                  </div>
                )}
              </label>
            </div>
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "保存中..." : "プロフィールを保存"}
                </button>
              </div>
            )}
          </section>

          {/* Stripe Connect section */}
          <section className="glass-card p-6 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              振込先設定（STRIPE CONNECT）
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-secondary">ステータス：</span>
              {settings.stripe_connected ? (
                <Badge variant={"success" as BadgeVariant}>接続済み</Badge>
              ) : (
                <Badge variant={"warning" as BadgeVariant}>未接続</Badge>
              )}
            </div>
            {settings.stripe_connected && settings.stripe_account_id && (
              <p className="text-xs text-muted">
                アカウントID: {settings.stripe_account_id}
              </p>
            )}
            <div className="flex gap-3">
              {settings.stripe_connected ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleStripeDashboard}
                  disabled={stripeLoading}
                >
                  {stripeLoading ? "読み込み中..." : "Stripe ダッシュボードを開く"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleStripeSetup}
                  disabled={stripeLoading}
                >
                  {stripeLoading ? "設定中..." : "Stripe Connect を設定"}
                </button>
              )}
            </div>
          </section>

          {/* LINE integration section */}
          <section className="glass-card p-6 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              LINE連携
            </div>
            {settings.line_official_account_id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-secondary">ステータス：</span>
                  <Badge variant={"success" as BadgeVariant}>連携済み</Badge>
                </div>
                <p className="text-sm text-secondary">
                  LINE公式アカウントID：
                  <span className="font-mono text-primary">
                    {settings.line_official_account_id}
                  </span>
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-secondary">ステータス：</span>
                <Badge variant={"default" as BadgeVariant}>未設定</Badge>
              </div>
            )}
          </section>

          {/* Notification settings section */}
          <section className="glass-card p-6 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              通知設定
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.email_notifications}
                onChange={(e) =>
                  updateField("email_notifications", e.target.checked)
                }
                className="h-4 w-4 rounded border-border-default text-accent focus:ring-accent"
              />
              <span className="text-sm text-primary">
                メール通知を受け取る
              </span>
            </label>
            <p className="text-xs text-muted">
              紹介ステータスの変更、コミッション確定、お知らせなどの通知をメールで受け取ります。
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "保存中..." : "通知設定を保存"}
              </button>
            </div>
          </section>

          {/* Logout section */}
          <section className="glass-card p-6 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">
              アカウント
            </div>
            <button
              type="button"
              className="rounded-lg border border-danger/30 bg-danger-dim px-4 py-2 text-sm font-medium text-danger-text hover:bg-danger/10 transition-colors"
              onClick={handleLogout}
            >
              ログアウト
            </button>
          </section>
        </>
      )}
    </div>
  );
}
