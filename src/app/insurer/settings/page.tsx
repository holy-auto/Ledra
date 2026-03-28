"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

/* ── preference items config ── */

const PREF_ITEMS = [
  {
    key: "case_update",
    label: "案件ステータス変更",
    description: "案件のステータスが変更された時に通知を受け取ります",
  },
  {
    key: "pii_decision",
    label: "PII開示承認/却下",
    description: "個人情報開示リクエストの承認・却下時に通知を受け取ります",
  },
  {
    key: "new_message",
    label: "新規メッセージ",
    description: "案件内で新しいメッセージが送信された時に通知を受け取ります",
  },
  {
    key: "sla_alert",
    label: "SLA期限超過アラート",
    description: "SLA対応期限が近づいた・超過した時にアラートを受け取ります",
  },
] as const;

type PrefKey = (typeof PREF_ITEMS)[number]["key"];

/* ── component ── */

export default function InsurerSettingsNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    case_update: true,
    pii_decision: true,
    new_message: true,
    sla_alert: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* auth check */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  /* fetch preferences */
  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/settings");
      if (!res.ok) throw new Error("設定の取得に失敗しました");
      const json = await res.json();
      if (json.preferences) {
        setPrefs((prev) => ({ ...prev, ...json.preferences }));
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchPrefs();
  }, [ready, fetchPrefs]);

  /* toggle handler */
  function handleToggle(key: PrefKey) {
    setSaved(false);
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /* save */
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setErr(null);

    try {
      const res = await fetch("/api/insurer/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });

      if (!res.ok) throw new Error("設定の保存に失敗しました");

      const json = await res.json();
      if (json.preferences) {
        setPrefs((prev) => ({ ...prev, ...json.preferences }));
      }
      setSaved(true);

      // Auto-hide success message
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-neutral-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">通知設定</h1>
        <p className="mt-1 text-sm text-neutral-500">
          メール通知の受信設定を管理します
        </p>
      </div>

      {/* Error */}
      {err && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          設定を保存しました
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="text-neutral-400">読み込み中...</div>
        </div>
      )}

      {/* Preference toggles */}
      {!loading && (
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h2 className="text-base font-semibold text-neutral-800">
              メール通知
            </h2>
            <p className="text-sm text-neutral-500">
              各種イベントのメール通知のオン/オフを切り替えます
            </p>
          </div>

          <div className="divide-y divide-neutral-100">
            {PREF_ITEMS.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <div className="text-sm font-medium text-neutral-800">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {item.description}
                  </div>
                </div>

                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[item.key]}
                  onClick={() => handleToggle(item.key)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    prefs[item.key] ? "bg-blue-600" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      prefs[item.key] ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Save button */}
          <div className="border-t border-neutral-100 px-6 py-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "保存中..." : "設定を保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
