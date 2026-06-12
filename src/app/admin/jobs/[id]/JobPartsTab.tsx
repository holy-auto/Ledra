"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { formatDate, formatJpy } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { PARTS_ORDER_STATUS_LABEL, type PartsOrderStatus } from "@/lib/validations/parts-order";
import type { BadgeVariant } from "@/lib/statusMaps";

/**
 * 案件ワークフローの「部品」タブ。
 *
 * この案件 (予約) に紐付く部品発注を一覧表示し、その場で追加できる。
 * 一覧管理は別画面「部品発注」で行う。
 */

type OrderRow = {
  id: string;
  part_name: string;
  part_number: string | null;
  supplier: string | null;
  quantity: number;
  unit_price: number | null;
  status: PartsOrderStatus;
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  notes: string | null;
};
type ListResponse = { orders: OrderRow[] };

const STATUS_BADGE: Record<PartsOrderStatus, BadgeVariant> = {
  ordered: "info",
  partial: "warning",
  received: "success",
  cancelled: "default",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  reservationId: string;
}

export default function JobPartsTab({ reservationId }: Props) {
  const [adding, setAdding] = useState(false);

  const swrKey = `/api/admin/parts-orders?reservation_id=${reservationId}`;
  const { data, isLoading, mutate } = useSWR<ListResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });

  const orders = data?.orders ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          部品発注 ({orders.length})
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary text-xs">
            + 部品を追加
          </button>
        )}
      </div>

      {adding && (
        <AddPartForm
          reservationId={reservationId}
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await mutate();
          }}
        />
      )}

      {isLoading && <div className="text-sm text-muted">読み込み中…</div>}

      {!isLoading && orders.length === 0 && !adding && (
        <div className="glass-card p-8 text-center text-sm text-muted">この案件に紐づく部品発注はまだありません。</div>
      )}

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="glass-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-primary">{o.part_name}</div>
                {(o.part_number || o.supplier) && (
                  <div className="mt-0.5 text-[12px] text-muted">
                    {[o.part_number, o.supplier].filter(Boolean).join(" / ")}
                  </div>
                )}
              </div>
              <Badge variant={STATUS_BADGE[o.status]}>{PARTS_ORDER_STATUS_LABEL[o.status]}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-secondary">
              <span>数量 {o.quantity}</span>
              {o.unit_price != null && <span>単価 {formatJpy(o.unit_price)}</span>}
              {o.expected_at && <span>入荷予定 {formatDate(o.expected_at)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 部品追加フォーム ───
function AddPartForm({
  reservationId,
  onCancel,
  onAdded,
}: {
  reservationId: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [partName, setPartName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    if (!partName.trim()) {
      setFormError("部品名は必須です。");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setFormError("数量は 1 以上の整数で指定してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/parts-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservationId,
          part_name: partName.trim(),
          part_number: partNumber.trim() || null,
          supplier: supplier.trim() || null,
          quantity: qty,
          unit_price: unitPrice.trim() ? Number(unitPrice) : null,
          ordered_at: todayStr(),
          expected_at: expectedAt || null,
        }),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      onAdded();
    } catch (e) {
      setFormError("追加に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card space-y-3 p-4">
      {formError && (
        <div className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger-text">{formError}</div>
      )}
      <input
        value={partName}
        onChange={(e) => setPartName(e.target.value)}
        placeholder="部品名（必須）"
        className="input-field w-full"
        maxLength={120}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          placeholder="品番"
          className="input-field w-full"
          maxLength={60}
        />
        <input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="仕入先"
          className="input-field w-full"
          maxLength={120}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          min={1}
          max={9999}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="数量"
          className="input-field w-full"
        />
        <input
          type="number"
          min={0}
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="単価"
          className="input-field w-full"
        />
        <input
          type="date"
          value={expectedAt}
          onChange={(e) => setExpectedAt(e.target.value)}
          className="input-field w-full"
          aria-label="入荷予定日"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          キャンセル
        </button>
        <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
          {submitting ? "追加中…" : "追加"}
        </button>
      </div>
    </div>
  );
}
