"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SlaConfig = {
  urgent: number;
  high: number;
  normal: number;
  low: number;
};

type SlaCase = {
  id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  sla_threshold_hours: number;
  elapsed_hours: number;
  remaining_hours: number;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "通常",
  high: "高",
  urgent: "緊急",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  normal: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

function formatHours(h: number): string {
  if (h < 0) {
    const abs = Math.abs(h);
    if (abs >= 24) return `${Math.floor(abs / 24)}日${Math.floor(abs % 24)}時間超過`;
    return `${abs.toFixed(1)}時間超過`;
  }
  if (h >= 24) return `残り${Math.floor(h / 24)}日${Math.floor(h % 24)}時間`;
  return `残り${h.toFixed(1)}時間`;
}

export default function InsurerSlaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<SlaConfig>({
    urgent: 4,
    high: 24,
    normal: 72,
    low: 168,
  });
  const [atRisk, setAtRisk] = useState<SlaCase[]>([]);
  const [overdue, setOverdue] = useState<SlaCase[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Edit config state
  const [editing, setEditing] = useState(false);
  const [editConfig, setEditConfig] = useState<SlaConfig>({ ...config });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  const fetchSla = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/sla");
      if (!res.ok) throw new Error("SLAデータの取得に失敗しました");
      const json = await res.json();
      setConfig(json.config);
      setEditConfig(json.config);
      setAtRisk(json.at_risk ?? []);
      setOverdue(json.overdue ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchSla();
  }, [ready, fetchSla]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/sla", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editConfig),
      });
      if (!res.ok) throw new Error("SLA設定の保存に失敗しました");
      setEditing(false);
      fetchSla();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  function formatThreshold(hours: number): string {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const rem = hours % 24;
      return rem > 0 ? `${days}日${rem}時間` : `${days}日`;
    }
    return `${hours}時間`;
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-neutral-500">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* header */}
      <header className="space-y-2">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-neutral-600">
          SLA管理
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          SLA管理
        </h1>
        <p className="text-sm text-neutral-500">
          優先度別の対応期限と、期限に近い・超過した案件を管理します
        </p>
      </header>

      {/* error */}
      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* SLA config card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">対応期限設定</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              編集
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["urgent", "high", "normal", "low"] as const).map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold mr-1 ${PRIORITY_COLORS[key]}`}
                    >
                      {PRIORITY_LABELS[key]}
                    </span>
                    （時間）
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editConfig[key]}
                    onChange={(e) =>
                      setEditConfig((prev) => ({
                        ...prev,
                        [key]: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditConfig({ ...config });
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["urgent", "high", "normal", "low"] as const).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center"
              >
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold mb-2 ${PRIORITY_COLORS[key]}`}
                >
                  {PRIORITY_LABELS[key]}
                </span>
                <p className="text-2xl font-bold text-neutral-900">
                  {formatThreshold(config[key])}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {busy ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-neutral-500">読み込み中…</p>
        </div>
      ) : (
        <>
          {/* Overdue cases */}
          <div className="rounded-2xl border border-red-200 bg-white p-6">
            <h2 className="text-lg font-bold text-red-800 mb-4">
              SLA超過案件
              {overdue.length > 0 && (
                <span className="ml-2 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-semibold text-red-800">
                  {overdue.length}
                </span>
              )}
            </h2>
            {overdue.length === 0 ? (
              <p className="text-sm text-neutral-500">SLAを超過している案件はありません</p>
            ) : (
              <div className="space-y-2">
                {overdue.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-500">
                          {c.case_number}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[c.priority] ?? PRIORITY_COLORS.normal}`}
                        >
                          {PRIORITY_LABELS[c.priority] ?? c.priority}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {c.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-red-700">
                        {formatHours(c.remaining_hours)}
                      </span>
                      <Link
                        href={`/insurer/cases/${c.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        詳細
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* At risk cases */}
          <div className="rounded-2xl border border-amber-200 bg-white p-6">
            <h2 className="text-lg font-bold text-amber-800 mb-4">
              SLA期限間近案件
              {atRisk.length > 0 && (
                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-800">
                  {atRisk.length}
                </span>
              )}
            </h2>
            {atRisk.length === 0 ? (
              <p className="text-sm text-neutral-500">
                SLA期限が近い案件はありません
              </p>
            ) : (
              <div className="space-y-2">
                {atRisk.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-500">
                          {c.case_number}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[c.priority] ?? PRIORITY_COLORS.normal}`}
                        >
                          {PRIORITY_LABELS[c.priority] ?? c.priority}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {c.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-amber-700">
                        {formatHours(c.remaining_hours)}
                      </span>
                      <Link
                        href={`/insurer/cases/${c.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        詳細
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
