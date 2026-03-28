"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface SecuritySettings {
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
  session_timeout_minutes: number;
}

const TIMEOUT_OPTIONS = [
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1時間" },
  { value: 120, label: "2時間" },
];

const DEFAULT_SETTINGS: SecuritySettings = {
  ip_whitelist_enabled: false,
  ip_whitelist: [],
  session_timeout_minutes: 30,
};

export default function InsurerSecurityPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // IP input state
  const [newIp, setNewIp] = useState("");
  const [ipError, setIpError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    })();
  }, [supabase]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insurer/security");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        const j = await res.json();
        setSettings({
          ip_whitelist_enabled: j.settings.ip_whitelist_enabled ?? false,
          ip_whitelist: j.settings.ip_whitelist ?? [],
          session_timeout_minutes: j.settings.session_timeout_minutes ?? 30,
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchSettings();
  }, [ready, fetchSettings]);

  const saveSettings = async (patch: Partial<SecuritySettings>) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/insurer/security", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok) {
        setSaveMessage(j.message ?? "保存に失敗しました。");
        return;
      }
      if (j.settings) {
        setSettings({
          ip_whitelist_enabled: j.settings.ip_whitelist_enabled ?? settings.ip_whitelist_enabled,
          ip_whitelist: j.settings.ip_whitelist ?? settings.ip_whitelist,
          session_timeout_minutes: j.settings.session_timeout_minutes ?? settings.session_timeout_minutes,
        });
      }
      setSaveMessage("保存しました。");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleAddIp = () => {
    setIpError(null);
    const trimmed = newIp.trim();
    if (!trimmed) return;

    const ipCidrPattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipCidrPattern.test(trimmed)) {
      setIpError("有効なIPアドレスまたはCIDR（例: 192.168.1.0/24）を入力してください。");
      return;
    }

    if (settings.ip_whitelist.includes(trimmed)) {
      setIpError("このIPアドレスは既に登録されています。");
      return;
    }

    const updated = [...settings.ip_whitelist, trimmed];
    setSettings((prev) => ({ ...prev, ip_whitelist: updated }));
    setNewIp("");
    saveSettings({ ip_whitelist: updated });
  };

  const handleRemoveIp = (ip: string) => {
    const updated = settings.ip_whitelist.filter((i) => i !== ip);
    setSettings((prev) => ({ ...prev, ip_whitelist: updated }));
    saveSettings({ ip_whitelist: updated });
  };

  const handleToggleWhitelist = () => {
    const newValue = !settings.ip_whitelist_enabled;
    setSettings((prev) => ({ ...prev, ip_whitelist_enabled: newValue }));
    saveSettings({ ip_whitelist_enabled: newValue });
  };

  const handleTimeoutChange = (minutes: number) => {
    setSettings((prev) => ({ ...prev, session_timeout_minutes: minutes }));
    saveSettings({ session_timeout_minutes: minutes });
  };

  if (!ready) return null;

  if (forbidden) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-3">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            SECURITY
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            セキュリティ設定
          </h1>
        </header>
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            このページは管理者のみアクセスできます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          SECURITY
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          セキュリティ設定
        </h1>
      </header>

      {/* Save feedback */}
      {saveMessage && (
        <div
          className={`rounded-xl border px-4 py-2 text-sm ${
            saveMessage.includes("失敗")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {saveMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-neutral-500">読み込み中...</p>
        </div>
      ) : (
        <>
          {/* Section 1: IP Whitelist */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-neutral-500">
              IP ACCESS CONTROL
            </div>
            <h2 className="mb-4 text-lg font-bold text-neutral-900">
              IP許可リスト
            </h2>

            {/* Enable toggle */}
            <div className="mb-6 flex items-center gap-3">
              <button
                onClick={handleToggleWhitelist}
                disabled={saving}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  settings.ip_whitelist_enabled
                    ? "bg-neutral-900"
                    : "bg-neutral-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    settings.ip_whitelist_enabled
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm text-neutral-700">
                IP制限を有効にする
              </span>
              {settings.ip_whitelist_enabled && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  有効
                </span>
              )}
            </div>

            {/* IP list */}
            {settings.ip_whitelist.length > 0 ? (
              <div className="mb-4 space-y-2">
                {settings.ip_whitelist.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-2"
                  >
                    <span className="font-mono text-sm text-neutral-700">
                      {ip}
                    </span>
                    <button
                      onClick={() => handleRemoveIp(ip)}
                      disabled={saving}
                      className="text-xs text-red-500 hover:text-red-700 disabled:text-neutral-300"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-neutral-500">
                許可IPアドレスが登録されていません。
              </p>
            )}

            {/* Add IP input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newIp}
                onChange={(e) => {
                  setNewIp(e.target.value);
                  setIpError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddIp();
                }}
                placeholder="192.168.1.0/24"
                className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:outline-none"
              />
              <button
                onClick={handleAddIp}
                disabled={saving || !newIp.trim()}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                追加
              </button>
            </div>
            {ipError && (
              <p className="mt-2 text-sm text-red-600">{ipError}</p>
            )}

            {settings.ip_whitelist_enabled &&
              settings.ip_whitelist.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  IP制限が有効ですが、許可IPが登録されていません。全てのアクセスがブロックされる可能性があります。
                </div>
              )}
          </div>

          {/* Section 2: Session Settings */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-neutral-500">
              SESSION SETTINGS
            </div>
            <h2 className="mb-4 text-lg font-bold text-neutral-900">
              セッション設定
            </h2>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                自動ログアウト時間
              </label>
              <div className="flex flex-wrap gap-2">
                {TIMEOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleTimeoutChange(opt.value)}
                    disabled={saving}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      settings.session_timeout_minutes === opt.value
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                    } disabled:cursor-not-allowed`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                設定した時間操作がない場合、自動的にログアウトされます。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
