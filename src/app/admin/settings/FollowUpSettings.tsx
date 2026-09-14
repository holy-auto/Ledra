"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  reminder_days_before: number[];
  follow_up_days_after: number[];
  enabled: boolean;
  maintenance_reminder_months: number[];
  maintenance_schedule_by_service: Record<string, number[]>;
  birthday_enabled: boolean;
  birthday_lead_days: number;
};

const DEFAULT_SETTINGS: Settings = {
  reminder_days_before: [30, 7, 1],
  follow_up_days_after: [90, 180],
  enabled: true,
  maintenance_reminder_months: [6, 12],
  maintenance_schedule_by_service: {},
  birthday_enabled: false,
  birthday_lead_days: 0,
};

interface DryRunItem {
  certId: string;
  scheduledDate: string;
  monthsSince: number;
  serviceType: string | null;
  serviceName: string | null;
  customerName: string;
  channel: "line" | "email" | "none";
}

interface DryRunResult {
  days: number;
  total: number;
  byChannel: { line: number; email: number; none: number };
  items: DryRunItem[];
}

export default function FollowUpSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // service_type 別 override の編集テキスト (UI のみ。保存時に JSON にパース)
  const [serviceOverrideText, setServiceOverrideText] = useState<string>("{}");
  const [serviceOverrideError, setServiceOverrideError] = useState<string | null>(null);
  // dry-run プレビュー
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/follow-up-settings", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j.settings) {
          const merged: Settings = { ...DEFAULT_SETTINGS, ...j.settings };
          setSettings(merged);
          setServiceOverrideText(JSON.stringify(merged.maintenance_schedule_by_service ?? {}, null, 2));
        }
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDryRun = async () => {
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRun(null);
    try {
      const res = await fetch("/api/admin/follow-up-settings/maintenance-dry-run?days=30", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDryRun(j as DryRunResult);
    } catch (e: any) {
      setDryRunError(e?.message ?? String(e));
    } finally {
      setDryRunLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    setServiceOverrideError(null);

    // service override JSON のパースと shape 検証は保存前に必ず通す
    let parsedOverride: Record<string, number[]> = {};
    const trimmed = serviceOverrideText.trim();
    if (trimmed) {
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
          throw new Error("オブジェクト形式 ({}) で入力してください");
        }
        for (const [key, value] of Object.entries(obj)) {
          if (!/^[a-z0-9_]+$/.test(key)) {
            throw new Error(`サービスキー "${key}" は英小文字・数字・_ のみ使えます`);
          }
          if (!Array.isArray(value) || !value.every((v) => Number.isInteger(v) && v >= 1 && v <= 120)) {
            throw new Error(`"${key}" の値は 1〜120 の整数配列にしてください`);
          }
          parsedOverride[key] = value as number[];
        }
      } catch (e: any) {
        setServiceOverrideError(e?.message ?? String(e));
        setSaving(false);
        return;
      }
    }

    try {
      const payload = { ...settings, maintenance_schedule_by_service: parsedOverride };
      const res = await fetch("/api/admin/follow-up-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSettings((prev) => ({ ...prev, maintenance_schedule_by_service: parsedOverride }));
      setMsg({ text: "保存しました", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const updateDays = (
    field: "reminder_days_before" | "follow_up_days_after" | "maintenance_reminder_months",
    value: string,
  ) => {
    const days = value
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    setSettings((prev) => ({ ...prev, [field]: days }));
  };

  if (loading) return <div className="text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-primary">フォロー自動化</label>
        <button
          type="button"
          onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? "bg-success" : "bg-surface-active"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-xs text-muted">{settings.enabled ? "有効" : "無効"}</span>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-secondary">有効期限リマインダー（期限の何日前に送信）</label>
          <input
            type="text"
            value={settings.reminder_days_before.join(", ")}
            onChange={(e) => updateDays("reminder_days_before", e.target.value)}
            placeholder="30, 7, 1"
            className="input-field"
          />
          <p className="text-[11px] text-muted">カンマ区切りで日数を指定（例: 30, 7, 1）</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-secondary">施工後フォロー（施工後何日後に送信）</label>
          <input
            type="text"
            value={settings.follow_up_days_after.join(", ")}
            onChange={(e) => updateDays("follow_up_days_after", e.target.value)}
            placeholder="90, 180"
            className="input-field"
          />
          <p className="text-[11px] text-muted">カンマ区切りで日数を指定（例: 90, 180）</p>
        </div>
      </div>

      {/* ── メンテナンスリマインダー (月単位) ── */}
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">メンテナンスリマインダー</h3>
          <p className="text-[11px] text-muted">
            施工から N ヶ月の節目に「点検にいらしてください」を送信。LINE が繋がっていれば LINE 優先、無ければ email。
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-secondary">テナント既定の月数</label>
          <input
            type="text"
            value={settings.maintenance_reminder_months.join(", ")}
            onChange={(e) => updateDays("maintenance_reminder_months", e.target.value)}
            placeholder="6, 12"
            className="input-field"
          />
          <p className="text-[11px] text-muted">カンマ区切り (例: 6, 12)。空配列にするとテナント全体で無効化。</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-secondary">施工種別ごとの上書き (JSON)</label>
          <textarea
            value={serviceOverrideText}
            onChange={(e) => setServiceOverrideText(e.target.value)}
            rows={5}
            spellCheck={false}
            className="input-field font-mono text-xs"
            placeholder={'{ "ppf": [6, 12, 24], "coating": [3, 6] }'}
          />
          <p className="text-[11px] text-muted">
            キーは <code>ppf</code> / <code>coating</code> / <code>body_repair</code> など。値は 1〜120 の整数配列。
            空配列にするとその種別だけ無効化。
          </p>
          {serviceOverrideError && <p className="text-[11px] text-red-500">{serviceOverrideError}</p>}
        </div>

        {/* dry-run プレビュー */}
        <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-primary">送信プレビュー</div>
              <div className="text-[11px] text-muted">今後 30 日に送信される予定 (実際には送らない)</div>
            </div>
            <button
              type="button"
              onClick={handleDryRun}
              disabled={dryRunLoading}
              className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover disabled:opacity-50"
            >
              {dryRunLoading ? "計算中…" : "プレビュー"}
            </button>
          </div>

          {dryRunError && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {dryRunError}
            </div>
          )}

          {dryRun && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-border-default bg-surface px-2 py-0.5">
                  合計 {dryRun.total} 件
                </span>
                <span className="rounded-full border border-accent/30 bg-accent-dim px-2 py-0.5 text-accent">
                  LINE {dryRun.byChannel.line}
                </span>
                <span className="rounded-full border border-border-default bg-surface px-2 py-0.5 text-secondary">
                  email {dryRun.byChannel.email}
                </span>
                {dryRun.byChannel.none > 0 && (
                  <span className="rounded-full border border-warning/30 bg-warning-dim px-2 py-0.5 text-warning">
                    連絡手段なし {dryRun.byChannel.none}
                  </span>
                )}
              </div>

              {dryRun.items.length === 0 ? (
                <p className="text-[11px] text-muted">この期間に送信予定のリマインダーはありません。</p>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                  <table className="w-full text-[11px]">
                    <thead className="bg-surface text-muted">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">送信予定</th>
                        <th className="px-2 py-1 text-left font-medium">顧客</th>
                        <th className="px-2 py-1 text-left font-medium">種別 / 月</th>
                        <th className="px-2 py-1 text-left font-medium">チャネル</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.items.map((item, i) => (
                        <tr key={`${item.certId}-${item.monthsSince}`} className={i % 2 ? "bg-inset" : ""}>
                          <td className="px-2 py-1 whitespace-nowrap">{item.scheduledDate}</td>
                          <td className="px-2 py-1 truncate max-w-[10rem]">{item.customerName}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {item.serviceType ?? "-"} / {item.monthsSince}m
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {item.channel === "line" ? (
                              "LINE"
                            ) : item.channel === "email" ? (
                              "email"
                            ) : (
                              <span className="text-warning">なし</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 誕生日メッセージ ── */}
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary">誕生日メッセージ</h3>
            <p className="text-[11px] text-muted">
              顧客の誕生日にお祝いを自動送信。LINE が繋がっていれば LINE 優先、無ければ
              email。生年月日が登録された顧客のみ対象。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, birthday_enabled: !prev.birthday_enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.birthday_enabled ? "bg-success" : "bg-surface-active"
            }`}
            aria-pressed={settings.birthday_enabled}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                settings.birthday_enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {settings.birthday_enabled && (
          <div className="space-y-1">
            <label className="text-xs text-secondary">送信タイミング（誕生日の何日前）</label>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.birthday_lead_days}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  birthday_lead_days: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)),
                }))
              }
              className="input-field w-28"
            />
            <p className="text-[11px] text-muted">0 = 誕生日当日に送信。例: 3 にすると 3 日前に送ります（0〜60）。</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
