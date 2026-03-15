"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  reminder_days_before: number[];
  follow_up_days_after: number[];
  enabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  reminder_days_before: [30, 7, 1],
  follow_up_days_after: [90, 180],
  enabled: true,
};

export default function FollowUpSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/follow-up-settings", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j.settings) setSettings(j.settings);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/follow-up-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "保存しました", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const updateDays = (field: "reminder_days_before" | "follow_up_days_after", value: string) => {
    const days = value
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    setSettings((prev) => ({ ...prev, [field]: days }));
  };

  if (loading) return <div className="text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-neutral-900">フォロー自動化</label>
        <button
          type="button"
          onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? "bg-emerald-500" : "bg-neutral-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-xs text-neutral-500">{settings.enabled ? "有効" : "無効"}</span>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">有効期限リマインダー（期限の何日前に送信）</label>
          <input
            type="text"
            value={settings.reminder_days_before.join(", ")}
            onChange={(e) => updateDays("reminder_days_before", e.target.value)}
            placeholder="30, 7, 1"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-neutral-400">カンマ区切りで日数を指定（例: 30, 7, 1）</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-500">施工後フォロー（施工後何日後に送信）</label>
          <input
            type="text"
            value={settings.follow_up_days_after.join(", ")}
            onChange={(e) => updateDays("follow_up_days_after", e.target.value)}
            placeholder="90, 180"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-neutral-400">カンマ区切りで日数を指定（例: 90, 180）</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
