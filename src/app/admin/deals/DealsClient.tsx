"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatJpy, formatDate } from "@/lib/format";
import { buildUsedCarEstimateItems } from "@/lib/market/usedCarFees";

/* ---------- types ---------- */
type DealStatus = "negotiating" | "agreed" | "completed" | "cancelled";

interface LinkedEstimate {
  id: string;
  doc_number: string | null;
  total: number | null;
  status: string | null;
}

interface TradeInVehicle {
  id: string;
  maker: string | null;
  model: string | null;
}

interface DealRow {
  id: string;
  vehicle_id: string;
  buyer_name: string;
  buyer_company: string | null;
  maker: string;
  model: string;
  agreed_price: number | null;
  note: string | null;
  status: DealStatus;
  created_at: string;
  estimate: LinkedEstimate | null;
  trade_in_vehicle_id: string | null;
  trade_in_allowance: number | null;
  trade_in_vehicle: TradeInVehicle | null;
}

interface VehicleOption {
  id: string;
  label: string;
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
  const [creatingEstimateId, setCreatingEstimateId] = useState<string | null>(null);

  // 下取り編集
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [editingTradeInId, setEditingTradeInId] = useState<string | null>(null);
  const [tradeInVehicleValue, setTradeInVehicleValue] = useState("");
  const [tradeInAllowanceValue, setTradeInAllowanceValue] = useState("");

  const fetchDeals = useCallback(async (status?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/market/deals?${params.toString()}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      const rows = (j?.deals ?? []) as Array<Record<string, unknown>>;
      setDeals(
        rows.map((d) => {
          const v = (d.market_vehicles ?? null) as { maker?: string; model?: string } | null;
          return {
            ...(d as unknown as DealRow),
            maker: v?.maker ?? "",
            model: v?.model ?? "",
            estimate: (d.estimate ?? null) as LinkedEstimate | null,
            trade_in_vehicle: (d.trade_in_vehicle ?? null) as TradeInVehicle | null,
          };
        }),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    }
  }, []);

  // 下取り車の候補（自テナントの在庫）を一度だけ取得する。
  const fetchVehicleOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/market-vehicles", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) return;
      const list = (j?.vehicles ?? []) as Array<Record<string, unknown>>;
      setVehicleOptions(
        list.map((v) => ({
          id: String(v.id),
          label: [v.maker, v.model, v.plate_number].filter(Boolean).join(" ") || String(v.id).slice(0, 8),
        })),
      );
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchDeals(), fetchVehicleOptions()]);
      setLoading(false);
    })();
  }, [fetchDeals, fetchVehicleOptions]);

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
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
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
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setEditingPriceId(null);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("価格更新に失敗しました: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  // 諸費用見積を作成し、商談に紐付ける。
  // 車両本体 + 標準諸費用のプリセット明細 (税込入力) で estimate ドキュメントを起票し、
  // 返った id を market_deals.estimate_document_id に結線する。金額は作成後に編集する運用。
  const handleCreateEstimate = async (deal: DealRow) => {
    const vehicleLabel = [deal.maker, deal.model].filter(Boolean).join(" ") || "車両";
    if (!confirm(`「${vehicleLabel}」の諸費用見積を作成しますか？（各金額は作成後に編集できます）`)) return;
    setCreatingEstimateId(deal.id);
    try {
      const tradeInLabel = deal.trade_in_vehicle
        ? [deal.trade_in_vehicle.maker, deal.trade_in_vehicle.model].filter(Boolean).join(" ")
        : "";
      const items = buildUsedCarEstimateItems({
        vehicleLabel,
        agreedPrice: deal.agreed_price,
        tradeInAllowance: deal.trade_in_allowance,
        tradeInLabel,
      });
      // 法人 (buyer_company あり) は会社名 + 御中、個人は氏名 + 様 で宛先を設定する。
      const corporate = Boolean(deal.buyer_company);
      const docRes = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: "estimate",
          subject: `お見積書（${vehicleLabel}）`,
          recipient_name: corporate ? deal.buyer_company : deal.buyer_name,
          recipient_honorific: corporate ? "御中" : "様",
          items,
          // 各金額は税込 (内税)。行単位の税区分を現行 documents が扱えないため税率0で作成し、
          // 支払総額 = 行金額の合計とする (請求書変換時も tax_rate を引き継ぎ二重課税しない)。
          tax_rate: 0,
          status: "draft",
          note: "金額は税込（内税）。消費税は各金額に含みます。法定費用・預託金・保険料は非課税です。各金額は確定後に編集してください。",
        }),
      });
      const dj = await parseJsonSafe(docRes);
      if (!docRes.ok) throw new Error(dj?.message ?? dj?.error ?? `HTTP ${docRes.status}`);
      const docId = dj?.document?.id ?? dj?.id;
      if (!docId) throw new Error("見積ドキュメントの作成に失敗しました。");

      const linkRes = await fetch(`/api/market/deals/${deal.id}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_document_id: docId }),
      });
      const lj = await parseJsonSafe(linkRes);
      if (!linkRes.ok) throw new Error(lj?.message ?? lj?.error ?? `HTTP ${linkRes.status}`);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("見積作成に失敗しました: " + msg);
    } finally {
      setCreatingEstimateId(null);
    }
  };

  // 下取り車・充当額を保存する。
  const handleTradeInSave = async (dealId: string) => {
    const allowance = tradeInAllowanceValue ? Number(tradeInAllowanceValue) : null;
    if (tradeInAllowanceValue && (isNaN(allowance as number) || (allowance as number) < 0)) {
      alert("有効な充当額を入力してください");
      return;
    }
    setUpdatingId(dealId);
    try {
      const res = await fetch(`/api/market/deals/${dealId}/trade-in`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_in_vehicle_id: tradeInVehicleValue || null,
          trade_in_allowance: allowance,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setEditingTradeInId(null);
      await fetchDeals(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("下取りの保存に失敗しました: " + msg);
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
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
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
      <PageHeader tag="取引" title="商談管理" description="商談の進捗を管理します。" />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select className="select-field" value={statusFilter} onChange={(e) => applyFilter(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Deal List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">取引一覧</div>
                <div className="mt-1 text-base font-semibold text-primary">商談一覧</div>
              </div>
              <div className="text-sm text-muted">{deals.length} 件</div>
            </div>

            {deals.length === 0 && <div className="glass-card p-8 text-center text-muted">商談がありません</div>}

            <div className="space-y-3">
              {deals.map((deal) => (
                <div key={deal.id} className="glass-card p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">
                        {deal.buyer_name}
                        {deal.buyer_company && (
                          <span className="ml-2 text-xs font-normal text-secondary">{deal.buyer_company}</span>
                        )}
                      </div>
                      <div className="text-xs text-secondary mt-0.5">
                        {deal.maker} {deal.model}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={statusVariant(deal.status)}>{statusLabel(deal.status)}</Badge>
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
                            className="btn-primary px-3 py-1 text-xs"
                            disabled={updatingId === deal.id}
                            onClick={() => handlePriceSave(deal.id)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1 text-xs"
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
                              className="btn-primary px-3 py-1 text-xs"
                              disabled={updatingId === deal.id}
                              onClick={() => handleNoteSave(deal.id)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1 text-xs"
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

                  {/* 下取り */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
                    <div className="text-[10px] text-muted">下取り</div>
                    {editingTradeInId === deal.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="select-field text-xs"
                          value={tradeInVehicleValue}
                          onChange={(e) => setTradeInVehicleValue(e.target.value)}
                        >
                          <option value="">（車両なし）</option>
                          {vehicleOptions
                            .filter((v) => v.id !== deal.vehicle_id) // 販売対象の車両は下取りに選べない
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          className="input-field w-32 text-xs"
                          value={tradeInAllowanceValue}
                          onChange={(e) => setTradeInAllowanceValue(e.target.value)}
                          placeholder="充当額"
                        />
                        <button
                          type="button"
                          className="btn-primary px-3 py-1 text-xs"
                          disabled={updatingId === deal.id}
                          onClick={() => handleTradeInSave(deal.id)}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1 text-xs"
                          onClick={() => setEditingTradeInId(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-sm text-secondary hover:underline text-left"
                        onClick={() => {
                          setEditingTradeInId(deal.id);
                          setTradeInVehicleValue(deal.trade_in_vehicle_id ?? "");
                          setTradeInAllowanceValue(deal.trade_in_allowance?.toString() ?? "");
                        }}
                      >
                        {deal.trade_in_allowance != null
                          ? `${
                              deal.trade_in_vehicle
                                ? [deal.trade_in_vehicle.maker, deal.trade_in_vehicle.model].filter(Boolean).join(" ") +
                                  " "
                                : ""
                            }充当 ${formatJpy(deal.trade_in_allowance)}`
                          : "設定する"}
                      </button>
                    )}
                  </div>

                  {/* 諸費用見積 */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
                    <div className="text-[10px] text-muted">諸費用見積</div>
                    {deal.estimate ? (
                      <a
                        href={`/admin/documents/${deal.estimate.id}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {deal.estimate.doc_number || "見積書"}
                        <span className="ml-2 text-secondary">支払総額 {formatJpy(deal.estimate.total)}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1 text-xs"
                        disabled={creatingEstimateId === deal.id}
                        onClick={() => handleCreateEstimate(deal)}
                      >
                        {creatingEstimateId === deal.id ? "作成中..." : "諸費用見積を作成"}
                      </button>
                    )}
                  </div>

                  {/* Status transition buttons */}
                  {nextStatuses(deal.status).length > 0 && (
                    <div className="flex gap-2 pt-1 border-t border-border-subtle">
                      {nextStatuses(deal.status).map((ns) => (
                        <button
                          key={ns}
                          type="button"
                          className={
                            ns === "cancelled" ? "btn-danger px-3 py-1 text-xs" : "btn-primary px-3 py-1 text-xs"
                          }
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
