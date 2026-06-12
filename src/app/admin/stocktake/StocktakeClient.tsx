"use client";

import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";

/* ---------- Types ---------- */

type StocktakeSession = {
  id: string;
  name: string;
  status: "open" | "closed";
  started_at: string;
  closed_at: string | null;
  notes: string | null;
  item_count: number;
  counted_count: number;
};

type StocktakeItem = {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  expected_qty: number;
  counted_qty: number | null;
  unit: string | null;
  notes: string | null;
  unit_price: number | null;
  discrepancy: number | null;
};

type SessionsData = { sessions: StocktakeSession[] };
type ItemsData = {
  session: { id: string; name: string; status: "open" | "closed" };
  items: StocktakeItem[];
};

/* ---------- Helpers ---------- */

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtQty(n: number | null): string {
  if (n == null) return "-";
  // 整数なら小数点なし、そうでなければ最大2桁
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/* ---------- Component ---------- */

export default function StocktakeClient() {
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<SessionsData>("/api/admin/stocktake", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const sessions = sessionsData?.sessions ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 明細データ (選択中セッション)
  const {
    data: itemsData,
    isLoading: itemsLoading,
    mutate: mutateItems,
  } = useSWR<ItemsData>(selectedId ? `/api/admin/stocktake/${selectedId}/items` : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;
  const isOpen = (itemsData?.session.status ?? selectedSession?.status) === "open";

  /* ---------- Create session ---------- */

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/stocktake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), notes: formNotes.trim() || null }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormName("");
      setFormNotes("");
      setMsg({ text: "棚卸を作成しました", ok: true });
      await mutateSessions();
      if (j?.session?.id) setSelectedId(j.session.id);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setCreating(false);
    }
  };

  /* ---------- Close session ---------- */

  const handleClose = async () => {
    if (!selectedId) return;
    if (!confirm("この棚卸を締めますか？締めた後は実測値を編集できません。")) return;
    try {
      const res = await fetch("/api/admin/stocktake", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedId, status: "closed" }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "棚卸を締めました", ok: true });
      await Promise.all([mutateSessions(), mutateItems()]);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    }
  };

  /* ---------- Save counted_qty (inline) ---------- */

  const saveCount = async (item: StocktakeItem, rawValue: string) => {
    if (!selectedId) return;
    const trimmed = rawValue.trim();
    const nextValue = trimmed === "" ? null : Number(trimmed);
    // 変更が無ければ何もしない
    if (nextValue === item.counted_qty) return;
    if (nextValue != null && (isNaN(nextValue) || nextValue < 0)) {
      setMsg({ text: "実測数は0以上の数値で入力してください。", ok: false });
      return;
    }
    try {
      const res = await fetch(`/api/admin/stocktake/${selectedId}/items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_id: item.id, counted_qty: nextValue }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await Promise.all([mutateItems(), mutateSessions()]);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="在庫管理"
        title="在庫棚卸"
        description="実測在庫とシステム上の期待在庫を突合し、差異を記録します。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm((v) => !v);
              setMsg(null);
            }}
          >
            {showForm ? "閉じる" : "＋ 新規棚卸"}
          </button>
        }
      />

      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

      {showForm && (
        <section className="glass-card space-y-4 p-5">
          <div className="text-base font-semibold text-primary">新規棚卸</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted">
                棚卸名 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="例: 2026年6月棚卸"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">メモ</label>
              <input
                type="text"
                className="input-field"
                placeholder="任意"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            作成時に、有効な品目マスタから棚卸明細を自動生成します。期待数は0で初期化されます。
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={creating || !formName.trim()}
              onClick={handleCreate}
            >
              {creating ? "作成中…" : "作成"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              キャンセル
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: session list */}
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-default p-4">
            <div className="text-xs font-semibold tracking-[0.12em] text-muted">棚卸一覧</div>
          </div>
          <div className="divide-y divide-border-default">
            {sessionsLoading && <div className="p-4 text-sm text-muted">読み込み中…</div>}
            {!sessionsLoading && sessions.length === 0 && (
              <div className="p-4 text-sm text-muted">棚卸がありません。「＋ 新規棚卸」から作成してください。</div>
            )}
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                  selectedId === s.id ? "bg-surface-hover" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-primary">{s.name}</span>
                  <Badge variant={s.status === "open" ? "success" : "default"}>
                    {s.status === "open" ? "進行中" : "締め済み"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{formatDate(s.started_at)}</span>
                  <span>
                    {s.counted_count}/{s.item_count} 品目
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Right: items table */}
        <section className="glass-card overflow-hidden">
          {!selectedId && (
            <div className="p-10 text-center text-sm text-muted">左の一覧から棚卸を選択してください。</div>
          )}
          {selectedId && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default p-4">
                <div>
                  <div className="text-base font-semibold text-primary">
                    {itemsData?.session.name ?? selectedSession?.name ?? "棚卸"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {isOpen ? "実測数を入力してください。" : "この棚卸は締め済みです。"}
                  </div>
                </div>
                {isOpen && (
                  <button type="button" className="btn-secondary" onClick={handleClose}>
                    棚卸を締める
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">品目名</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">
                        期待数
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">
                        実測数
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">差異</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {itemsLoading && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted">
                          読み込み中…
                        </td>
                      </tr>
                    )}
                    {!itemsLoading &&
                      (itemsData?.items ?? []).map((it) => (
                        <tr key={it.id} className="hover:bg-surface-hover/60">
                          <td className="px-4 py-3 font-medium text-primary">{it.menu_item_name}</td>
                          <td className="px-4 py-3 text-right text-secondary">{fmtQty(it.expected_qty)}</td>
                          <td className="px-4 py-3 text-right">
                            {isOpen ? (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={it.counted_qty ?? ""}
                                key={`${it.id}-${it.counted_qty ?? "null"}`}
                                className="input-field w-24 py-1 text-right text-sm"
                                placeholder="未"
                                onBlur={(e) => saveCount(it, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                              />
                            ) : (
                              <span className="text-secondary">{fmtQty(it.counted_qty)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {it.discrepancy == null ? (
                              <span className="text-muted">-</span>
                            ) : (
                              <span
                                className={
                                  it.discrepancy < 0
                                    ? "font-medium text-danger"
                                    : it.discrepancy > 0
                                      ? "font-medium text-accent"
                                      : "text-muted"
                                }
                              >
                                {it.discrepancy > 0 ? "+" : ""}
                                {fmtQty(it.discrepancy)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    {!itemsLoading && (itemsData?.items ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted">
                          明細がありません。品目マスタに有効な品目を登録してください。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
