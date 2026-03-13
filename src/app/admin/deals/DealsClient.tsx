"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatJpy, formatDate } from "@/lib/format";

/* ---------- types ---------- */
type DealStatus = "negotiating" | "agreed" | "completed" | "cancelled";

interface DealRow {
  id: string;
  buyer_name: string;
  buyer_company: string | null;
  maker: string;
  model: string;
  agreed_price: number | null;
  note: string | null;
  status: DealStatus;
  created_at: string;
}

/* ---------- helpers ---------- */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "negotiating", label: "商談中" },
  { value: "agreed", label: "合意" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

const statusLabel = (s: DealStatus): string => {
  const m: Record<DealStatus, string> = {
    negotiating: "商談中",
    agreed: "合意",
    completed: "完了",
    cancelled: "キャンセル",
  };
  return m[s] ?? s;
};

const statusVariant = (s: DealStatus): "default" | "success" | "warning" | "danger" | "info" => {
  const m: Record<DealStatus, "default" | "success" | "warning" | "danger" | "info"> = {
    negotiating: "warning",
    agreed: "info",
    completed: "success",
    cancelled: "danger",
  };
  return m[s] ?? "default";
};

/** Valid next statuses for a given status */
const nextStatuses = (s: DealStatus): DealStatus[] => {
  const transitions: Record<DealStatus, DealStatus[]> = {
    negotiating: ["agreed", "cancelled"],
    agreed: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };
  return transitions[s] ?? [];
};

/* ---------- component ---------- */
export default function DealsClient() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");

  // Inline editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchDeals = useCallback(async (status?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/market/deals?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setDeals(j.deals ?? j ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchDeals();
      setLoading(false);
    })();
  }, [fetchDeals]);

  const applyFilter = (newStatus: string) => {
    setStatusFilter(newStatus);
    fetchDeals(newStatus);
  };

  const handleStatusChange = async (dealId: string, newStatus: DealStatus) => {
    const labelMap: Record<DealStatus, string> = {
      negotiating: "商談中",
      agreed: "合意",
      completed: "完了",
      cancelled: "キャンセル",
    };
    if (!confirm(`ステータスを「${labelMap[newStatus]}」に変更しますか?`)) return;
    setUpdatingId(dealId);
    try {
      const res = await fetch(`/api/market/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("ステータス更新に失敗しました: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePriceSave = async (dealId: string) => {
    const price = editingPriceValue ? Number(editingPriceValue) : null;
    if (editingPriceValue && (isNaN(price as number) || (price as number) < 0)) {
      alert("有効な金額を入力してください");
      return;
    }
    setUpdatingId(dealId);
    try {
      const res = await fetch(`/api/market/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreed_price: price }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setEditingPriceId(null);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("価格更新に失敗しました: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleNoteSave = async (dealId: string) => {
    setUpdatingId(dealId);
    try {
      const res = await fetch(`/api/market/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingNoteValue || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setEditingNoteId(null);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("メモ更新に失敗しました: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="DEALS"
        title="商談管理"
        description="商談の進捗を管理します。"
      />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => applyFilter(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Deal List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">DEAL LIST</div>
                <div className="mt-1 text-base font-semibold text-primary">商談一覧</div>
              </div>
              <div className="text-sm text-muted">{deals.length} 件</div>
            </div>

            {deals.length === 0 && (
              <div className="glass-card p-8 text-center text-muted">
                商談がありません
              </div>
            )}

            <div className="space-y-3">
              {deals.map((deal) => (
                <div key={deal.id} className="glass-card p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">
                        {deal.buyer_name}
                        {deal.buyer_company && (
                          <span className="ml-2 text-xs font-normal text-secondary">
                            {deal.buyer_company}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-secondary mt-0.5">
                        {deal.maker} {deal.model}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={statusVariant(deal.status)}>
                        {statusLabel(deal.status)}
                      </Badge>
                      <span className="text-xs text-muted">{formatDate(deal.created_at)}</span>
                    </div>
                  </div>

                  {/* Price & Note */}
                  <div className="flex flex-wrap gap-4">
                    {/* Agreed price */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted">合意価格</div>
                      {editingPriceId === deal.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="input-field w-36"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            placeholder="金額を入力"
                          />
                          <button
                            type="button"
                            className="btn-primary !px-3 !py-1 !text-xs"
                            disabled={updatingId === deal.id}
                            onClick={() => handlePriceSave(deal.id)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="btn-secondary !px-3 !py-1 !text-xs"
                            onClick={() => setEditingPriceId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-sm font-bold text-primary hover:underline"
                          onClick={() => {
                            setEditingPriceId(deal.id);
                            setEditingPriceValue(deal.agreed_price?.toString() ?? "");
                          }}
                        >
                          {formatJpy(deal.agreed_price)}
                        </button>
                      )}
                    </div>

                    {/* Note */}
                    <div className="space-y-1 flex-1 min-w-[200px]">
                      <div className="text-[10px] text-muted">メモ</div>
                      {editingNoteId === deal.id ? (
                        <div className="flex items-start gap-2">
                          <textarea
                            className="input-field w-full min-h-[60px]"
                            value={editingNoteValue}
                            onChange={(e) => setEditingNoteValue(e.target.value)}
                            placeholder="メモを入力"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className="btn-primary !px-3 !py-1 !text-xs"
                              disabled={updatingId === deal.id}
                              onClick={() => handleNoteSave(deal.id)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn-secondary !px-3 !py-1 !text-xs"
                              onClick={() => setEditingNoteId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-secondary hover:underline text-left"
                          onClick={() => {
                            setEditingNoteId(deal.id);
                            setEditingNoteValue(deal.note ?? "");
                          }}
                        >
                          {deal.note || "-"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status transition buttons */}
                  {nextStatuses(deal.status).length > 0 && (
                    <div className="flex gap-2 pt-1 border-t border-border-subtle">
                      {nextStatuses(deal.status).map((ns) => (
                        <button
                          key={ns}
                          type="button"
                          className={ns === "cancelled" ? "btn-danger !px-3 !py-1 !text-xs" : "btn-primary !px-3 !py-1 !text-xs"}
                          disabled={updatingId === deal.id}
                          onClick={() => handleStatusChange(deal.id, ns)}
                        >
                          {updatingId === deal.id ? "更新中..." : statusLabel(ns) + "にする"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
