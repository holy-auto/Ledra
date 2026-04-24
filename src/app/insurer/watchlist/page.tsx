"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

type WatchlistItem = {
  id: string;
  target_type: string;
  target_id: string;
  created_at: string;
  target_detail: {
    identifier: string;
    status: string | null;
    updated_at: string | null;
  } | null;
};

const TYPE_LABELS: Record<string, string> = {
  certificate: "証明書",
  vehicle: "車両",
};

const TYPE_COLORS: Record<string, string> = {
  certificate: "bg-blue-100 text-blue-800",
  vehicle: "bg-emerald-100 text-emerald-800",
};

export default function InsurerWatchlistPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"certificate" | "vehicle">("certificate");
  const [formTargetId, setFormTargetId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  const fetchItems = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/watchlist");
      if (!res.ok) throw new Error("ウォッチリストの取得に失敗しました");
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchItems();
  }, [ready, fetchItems]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formTargetId.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          target_id: formTargetId.trim(),
        }),
      });
      if (!res.ok) {
        const json = await parseJsonSafe(res);
        throw new Error(json?.message ?? "追加に失敗しました");
      }
      setFormTargetId("");
      setShowForm(false);
      fetchItems();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/watchlist?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      fetchItems();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }

  function getDetailLink(item: WatchlistItem): string {
    if (item.target_type === "certificate") {
      return `/insurer/c/${item.target_detail?.identifier ?? item.target_id}`;
    }
    return `/insurer/vehicles/${item.target_id}`;
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-secondary">
            ウォッチリスト
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">ウォッチリスト</h1>
          <p className="text-sm text-muted">注目している証明書や車両をブックマークして追跡できます</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary self-start">
          {showForm ? "キャンセル" : "追加"}
        </button>
      </header>

      {/* add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-border-default bg-surface p-6 space-y-4">
          <h2 className="text-lg font-bold text-primary">ウォッチリストに追加</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">タイプ</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as "certificate" | "vehicle")}
                className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="certificate">証明書</option>
                <option value="vehicle">車両</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">
                対象ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formTargetId}
                onChange={(e) => setFormTargetId(e.target.value)}
                className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={formType === "certificate" ? "証明書のUUID" : "車両のUUID"}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-border-default px-4 py-2 text-sm font-medium text-secondary hover:bg-inset"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting || !formTargetId.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? "追加中…" : "追加"}
            </button>
          </div>
        </form>
      )}

      {/* error */}
      {err && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* watchlist items */}
      {busy ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-muted">読み込み中…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface p-12 text-center">
          <p className="text-muted">ウォッチリストにアイテムがありません</p>
          <p className="mt-1 text-sm text-muted">
            証明書や車両の詳細ページから追加するか、「追加」ボタンから直接登録できます
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-default bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left">
                <th className="px-4 py-3 font-semibold text-secondary">タイプ</th>
                <th className="px-4 py-3 font-semibold text-secondary">識別子</th>
                <th className="px-4 py-3 font-semibold text-secondary">ステータス</th>
                <th className="px-4 py-3 font-semibold text-secondary">最終更新</th>
                <th className="px-4 py-3 font-semibold text-secondary">登録日</th>
                <th className="px-4 py-3 font-semibold text-secondary">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border-subtle last:border-0 hover:bg-inset">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[item.target_type] ?? "bg-surface-hover text-secondary"}`}
                    >
                      {TYPE_LABELS[item.target_type] ?? item.target_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-primary">
                    {item.target_detail ? (
                      <Link href={getDetailLink(item)} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {item.target_detail.identifier}
                      </Link>
                    ) : (
                      <span className="text-muted font-mono text-xs">{item.target_id.slice(0, 8)}…（削除済み）</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">{item.target_detail?.status ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {item.target_detail?.updated_at ? formatDateTime(item.target_detail.updated_at) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-sm font-medium text-red-600 hover:text-red-800 hover:underline"
                    >
                      解除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
