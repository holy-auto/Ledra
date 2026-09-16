"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatJpy, formatDate } from "@/lib/format";
import { PARTS_ORDER_STATUS_LABEL, type PartsOrderStatus } from "@/lib/validations/parts-order";
import type { BadgeVariant } from "@/lib/statusMaps";

// ─── 型 ───
type ReservationRef = { id: string; title: string | null; scheduled_date: string | null } | null;

type OrderRow = {
  id: string;
  reservation_id: string | null;
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
  reservation: ReservationRef;
};

type ListResponse = { orders: OrderRow[] };
type ReservationListResponse = {
  reservations: { id: string; title: string | null; customer_name: string | null; scheduled_date: string | null }[];
};

type FilterTab = "all" | "pending" | "received" | "overdue";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "全件" },
  { key: "pending", label: "未入荷" },
  { key: "received", label: "入荷済" },
  { key: "overdue", label: "遅延" },
];

const STATUS_BADGE: Record<PartsOrderStatus, BadgeVariant> = {
  ordered: "info",
  partial: "warning",
  received: "success",
  cancelled: "default",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(o: OrderRow): boolean {
  if (!o.expected_at) return false;
  if (o.status === "received" || o.status === "cancelled") return false;
  return o.expected_at < todayStr();
}

export default function PartsOrdersClient() {
  const [tab, setTab] = useState<FilterTab>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // サーバ側フィルタ: 未入荷は ordered/partial の合算なのでクライアントで絞る。
  const swrKey = (() => {
    if (tab === "received") return "/api/admin/parts-orders?status=received";
    if (tab === "overdue") return "/api/admin/parts-orders?overdue_only=true";
    return "/api/admin/parts-orders";
  })();
  const { data, isLoading, error, mutate } = useSWR<ListResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });

  const orders = useMemo(() => {
    const list = data?.orders ?? [];
    if (tab === "pending") return list.filter((o) => o.status === "ordered" || o.status === "partial");
    return list;
  }, [data, tab]);

  const updateStatus = async (order: OrderRow, status: PartsOrderStatus) => {
    const label = PARTS_ORDER_STATUS_LABEL[status];
    if (status === "received" && !confirm(`「${order.part_name}」を入荷済にします。よろしいですか？`)) return;
    setBusyId(order.id);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/parts-orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, status }),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      await mutate();
    } catch (e) {
      setErrorMsg(`${label}への更新に失敗しました: ` + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="部品"
        title="部品発注"
        description="案件ごとに発注した部品を追跡します。入荷待ち・部品待ちで止まっている案件をまとめて把握できます。"
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            + 部品を発注
          </button>
        }
        tabs={FILTER_TABS}
        activeTab={tab}
        onTabSelect={(k) => setTab(k as FilterTab)}
      />

      {errorMsg && <div className="glass-card border-l-4 border-danger p-3 text-xs text-danger-text">{errorMsg}</div>}

      {isLoading && <div className="text-sm text-muted">読み込み中…</div>}
      {error && (
        <div className="glass-card p-4 text-sm text-danger-text">
          {error instanceof Error ? error.message : "読み込みに失敗しました"}
        </div>
      )}

      {data && orders.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="text-3xl">📦</div>
          <div className="mt-2 text-sm font-medium text-primary">該当する発注はありません</div>
          <p className="mt-1 text-xs text-muted">「+ 部品を発注」から案件に紐づく部品の発注を登録できます。</p>
        </div>
      )}

      {data && orders.length > 0 && (
        <div className="glass-card overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                {["部品名", "品番", "仕入先", "数量", "単価", "案件", "発注日", "入荷予定", "状態", "操作"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {orders.map((o) => {
                const overdue = isOverdue(o);
                const busy = busyId === o.id;
                return (
                  <tr key={o.id} className="hover:bg-surface-hover/60">
                    <td className="px-4 py-3 font-medium text-primary">{o.part_name}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-secondary">{o.part_number ?? "—"}</td>
                    <td className="px-4 py-3 text-secondary">{o.supplier ?? "—"}</td>
                    <td className="px-4 py-3 text-secondary">{o.quantity}</td>
                    <td className="px-4 py-3 text-secondary">{o.unit_price != null ? formatJpy(o.unit_price) : "—"}</td>
                    <td className="px-4 py-3 text-secondary">
                      {o.reservation?.title ? (
                        <span className="truncate">{o.reservation.title}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-secondary">{formatDate(o.ordered_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {o.expected_at ? (
                        <span className={overdue ? "font-semibold text-danger-text" : "text-secondary"}>
                          {formatDate(o.expected_at)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[o.status]}>{PARTS_ORDER_STATUS_LABEL[o.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {(o.status === "ordered" || o.status === "partial") && (
                        <div className="flex gap-1.5">
                          {o.status === "ordered" && (
                            <button
                              type="button"
                              onClick={() => updateStatus(o, "partial")}
                              disabled={busy}
                              className="btn-ghost text-xs disabled:opacity-50"
                            >
                              一部入荷
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => updateStatus(o, "received")}
                            disabled={busy}
                            className="btn-secondary text-xs disabled:opacity-50"
                          >
                            入荷
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOrderDialog
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

// ─── 新規発注ダイアログ ───
function CreateOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [partName, setPartName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [orderedAt, setOrderedAt] = useState(todayStr());
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [reservationQuery, setReservationQuery] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 案件検索: 直近の予約を取得して datalist に出す (顧客名 / タイトルで選択)。
  const { data: resData } = useSWR<ReservationListResponse>(
    "/api/admin/reservations?status=all&per_page=100&page=1",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );
  const reservations = useMemo(() => resData?.reservations ?? [], [resData]);

  // datalist の表示ラベル -> id を解決。
  const optionLabel = (r: ReservationListResponse["reservations"][number]) =>
    [r.scheduled_date, r.customer_name, r.title].filter(Boolean).join(" / ") || r.id;

  const resolveReservation = (value: string) => {
    setReservationQuery(value);
    const match = reservations.find((r) => optionLabel(r) === value || r.id === value);
    setReservationId(match?.id ?? "");
  };

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
          part_name: partName.trim(),
          part_number: partNumber.trim() || null,
          supplier: supplier.trim() || null,
          quantity: qty,
          unit_price: unitPrice.trim() ? Number(unitPrice) : null,
          ordered_at: orderedAt || null,
          expected_at: expectedAt || null,
          reservation_id: reservationId || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      onCreated();
    } catch (e) {
      setFormError("作成に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">部品を発注</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            ✕
          </button>
        </div>

        {formError && (
          <div className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger-text">
            {formError}
          </div>
        )}

        <Field label="部品名" required>
          <input
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            placeholder="フロントバンパー"
            className="input-field w-full"
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="品番">
            <input
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              placeholder="52119-XXXXX"
              className="input-field w-full"
              maxLength={60}
            />
          </Field>
          <Field label="仕入先">
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="部品商社名"
              className="input-field w-full"
              maxLength={120}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="数量" required>
            <input
              type="number"
              min={1}
              max={9999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-field w-full"
            />
          </Field>
          <Field label="単価（円）">
            <input
              type="number"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0"
              className="input-field w-full"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="発注日">
            <input
              type="date"
              value={orderedAt}
              onChange={(e) => setOrderedAt(e.target.value)}
              className="input-field w-full"
            />
          </Field>
          <Field label="入荷予定日">
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="input-field w-full"
            />
          </Field>
        </div>

        <Field label="案件（任意・顧客名や日付で検索）">
          <input
            list="po-reservation-list"
            value={reservationQuery}
            onChange={(e) => resolveReservation(e.target.value)}
            placeholder="案件を選択（紐付けなしも可）"
            className="input-field w-full"
          />
          <datalist id="po-reservation-list">
            {reservations.map((r) => (
              <option key={r.id} value={optionLabel(r)} />
            ))}
          </datalist>
          {reservationQuery.trim() && !reservationId && (
            <p className="mt-1 text-[11px] text-warning-text">
              一覧から案件を選択してください（未選択のままだと紐付けされません）。
            </p>
          )}
        </Field>

        <Field label="メモ">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field min-h-[48px] w-full"
            maxLength={500}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
            {submitting ? "作成中…" : "発注を登録"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger-text">*</span>}
      </span>
      {children}
    </label>
  );
}
