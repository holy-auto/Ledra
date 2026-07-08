"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { TIRE_TYPES, TIRE_TYPE_LABEL, type TireType, type TireStorageStatus } from "@/lib/validations/tire-storage";

// ─── 型定義 ──────────────────────────────────────────────────────
interface JoinedCustomer {
  id: string;
  name: string;
}
interface JoinedVehicle {
  id: string;
  maker: string | null;
  model: string | null;
  plate_display: string | null;
}
interface TireStorage {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  customer_name: string | null;
  vehicle_info: string | null;
  tire_type: TireType;
  tire_size: string | null;
  brand: string | null;
  quantity: number;
  storage_location: string | null;
  status: TireStorageStatus;
  stored_at: string;
  returned_at: string | null;
  swap_month: number | null;
  notes: string | null;
  customer: JoinedCustomer | null;
  vehicle: JoinedVehicle | null;
}

interface CustomerOption {
  id: string;
  name: string;
}
interface VehicleOption {
  id: string;
  label: string;
  maker: string | null;
  model: string | null;
  plate_display: string | null;
}

type StatusFilter = "stored" | "returned" | "all";
type SwapFilter = "this" | "next" | "all";

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function tireTypeBadge(t: TireType): string {
  switch (t) {
    case "summer":
      return "bg-warning-dim text-warning-text";
    case "winter":
      return "bg-accent-dim text-accent-text";
    case "all_season":
      return "bg-success-dim text-success-text";
  }
}

function vehicleText(s: TireStorage): string {
  if (s.vehicle) {
    const base = [s.vehicle.maker, s.vehicle.model].filter(Boolean).join(" ");
    const plate = s.vehicle.plate_display ?? "";
    const joined = [base, plate].filter(Boolean).join(" ");
    if (joined) return joined;
  }
  return s.vehicle_info || "—";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  // stored_at / returned_at は YYYY-MM-DD (date 型)。
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth(): number {
  return new Date().getMonth() + 1;
}
function nextMonth(): number {
  return ((new Date().getMonth() + 1) % 12) + 1;
}

/** 交換時期 (swap_month が今月 or 来月) かつ保管中なら true。 */
function isSwapDue(s: TireStorage): boolean {
  if (s.status !== "stored" || s.swap_month == null) return false;
  return s.swap_month === currentMonth() || s.swap_month === nextMonth();
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function TireStorageClient() {
  const [items, setItems] = useState<TireStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("stored");
  const [swapFilter, setSwapFilter] = useState<SwapFilter>("all");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<TireStorage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/admin/tire-storage?${params.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error(e);
      showToast("error", "タイヤ保管の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showToast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // swap_month フィルタはクライアント側で適用 (status と独立)。
  const visible = useMemo(() => {
    if (swapFilter === "all") return items;
    const target = swapFilter === "this" ? currentMonth() : nextMonth();
    return items.filter((s) => s.swap_month === target);
  }, [items, swapFilter]);

  const handleReturn = useCallback(
    async (s: TireStorage) => {
      setBusyId(s.id);
      try {
        const res = await fetch("/api/admin/tire-storage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: s.id, status: "returned" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "return failed");
        }
        showToast("success", "返却を記録しました");
        setReturnTarget(null);
        await fetchItems();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "返却に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [fetchItems, showToast],
  );

  const SWAP_TABS: { key: SwapFilter; label: string }[] = [
    { key: "this", label: "今月交換" },
    { key: "next", label: "来月交換" },
    { key: "all", label: "全月" },
  ];

  return (
    <div className="mx-auto max-w-6xl pb-20">
      {/* ヘッダー + ステータスタブ（L3 ページバー）。件数はステータス別サーバー取得のためバッジ無し。 */}
      <PageHeader
        tag="保管"
        title="タイヤ保管"
        description="預かりタイヤの保管状況と季節交換時期を管理します"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            タイヤ預かり登録
          </button>
        }
        tabs={[
          { key: "stored", label: "保管中" },
          { key: "returned", label: "返却済" },
          { key: "all", label: "全件" },
        ]}
        activeTab={statusFilter}
        onTabSelect={(k) => setStatusFilter(k as StatusFilter)}
      />

      {/* 交換時期フィルタ */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">交換時期</span>
          <div className="flex rounded-lg border border-border-default p-0.5">
            {SWAP_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSwapFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  swapFilter === t.key ? "bg-surface-active text-primary" : "text-secondary hover:text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">
            {statusFilter === "stored" && swapFilter === "all"
              ? "保管中のタイヤがありません。「タイヤ預かり登録」から追加してください。"
              : "該当する保管記録はありません。"}
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">顧客名</th>
                <th className="px-3 py-2.5 font-medium">車両</th>
                <th className="px-3 py-2.5 font-medium">種別</th>
                <th className="px-3 py-2.5 font-medium">サイズ</th>
                <th className="px-3 py-2.5 font-medium">本数</th>
                <th className="px-3 py-2.5 font-medium">保管場所</th>
                <th className="px-3 py-2.5 font-medium">交換推奨月</th>
                <th className="px-3 py-2.5 font-medium">保管日</th>
                <th className="px-3 py-2.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const swapDue = isSwapDue(s);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border-subtle last:border-0 ${
                      swapDue ? "border-l-4 border-l-amber-400 bg-amber-400/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 text-primary">{s.customer?.name ?? s.customer_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-secondary">{vehicleText(s)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tireTypeBadge(s.tire_type)}`}>
                        {TIRE_TYPE_LABEL[s.tire_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{s.tire_size ?? "—"}</td>
                    <td className="px-3 py-2.5 text-secondary">{s.quantity}本</td>
                    <td className="px-3 py-2.5 text-secondary">{s.storage_location ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {s.swap_month != null ? (
                        <span
                          className={swapDue ? "font-semibold text-amber-600 dark:text-amber-400" : "text-secondary"}
                        >
                          {s.swap_month}月{swapDue && "（交換時期）"}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{formatDate(s.stored_at)}</td>
                    <td className="px-3 py-2.5">
                      {s.status === "stored" ? (
                        <button
                          disabled={busyId === s.id}
                          onClick={() => setReturnTarget(s)}
                          className="rounded-lg bg-inset px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                        >
                          返却
                        </button>
                      ) : (
                        <span className="text-xs text-muted">
                          {s.status === "returned" ? `返却済 ${formatDate(s.returned_at)}` : "廃棄"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 登録ダイアログ */}
      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            showToast("success", "タイヤ預かりを登録しました");
            await fetchItems();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 返却ダイアログ */}
      {returnTarget && (
        <ReturnDialog
          item={returnTarget}
          submitting={busyId === returnTarget.id}
          onClose={() => setReturnTarget(null)}
          onConfirm={() => handleReturn(returnTarget)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 登録ダイアログ ───
function CreateDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const { customers, search, setSearch } = useCustomerSearch();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const vehicles = useVehiclesForCustomer(customerId);
  const [vehicleId, setVehicleId] = useState("");

  const [tireType, setTireType] = useState<TireType>("winter");
  const [tireSize, setTireSize] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("4");
  const [location, setLocation] = useState("");
  const [swapMonth, setSwapMonth] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 顧客を変えたら車両選択をクリア。
  useEffect(() => {
    setVehicleId("");
  }, [customerId]);

  async function submit() {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 8) {
      onError("本数は1〜8で入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/tire-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          vehicle_id: vehicleId || null,
          customer_name: customerName.trim() || null,
          tire_type: tireType,
          tire_size: tireSize.trim() || null,
          brand: brand.trim() || null,
          quantity: qty,
          storage_location: location.trim() || null,
          swap_month: swapMonth ? Number(swapMonth) : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="タイヤ預かり登録" onClose={onClose}>
      <div className="space-y-4">
        <Field label="顧客（検索して選択 / 直接入力）">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCustomerId("");
              setCustomerName(e.target.value);
            }}
            placeholder="顧客名で検索 または 直接入力"
            className={`w-full ${inputCls}`}
          />
          {search && customers.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border-default bg-surface">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setSearch(c.name);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover ${
                      customerId === c.id ? "text-accent" : "text-secondary"
                    }`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        <Field label="車両（顧客に紐付く車両）">
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={!customerId}
            className={`w-full ${inputCls} disabled:opacity-50`}
          >
            <option value="">{customerId ? "（車両を選択）" : "先に顧客を選択"}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="タイヤ種別">
          <div className="flex flex-wrap gap-2">
            {TIRE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTireType(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  tireType === t
                    ? "border-accent bg-accent-dim text-accent-text"
                    : "border-border-default text-secondary hover:bg-surface-hover"
                }`}
              >
                {TIRE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="サイズ">
            <input
              value={tireSize}
              onChange={(e) => setTireSize(e.target.value)}
              placeholder="例: 195/65R15"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="ブランド">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="例: ブリヂストン"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="本数" required>
            <input
              type="number"
              min={1}
              max={8}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="保管場所">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例: 棚A-3"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="交換推奨月">
            <select value={swapMonth} onChange={(e) => setSwapMonth(e.target.value)} className={`w-full ${inputCls}`}>
              <option value="">（未設定）</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>
      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="登録する" />
    </DialogShell>
  );
}

// ─── 返却ダイアログ ───
function ReturnDialog({
  item,
  submitting,
  onClose,
  onConfirm,
}: {
  item: TireStorage;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const todayStr = formatDate(new Date().toISOString().slice(0, 10));
  return (
    <DialogShell title="タイヤを返却" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-secondary">以下の預かりタイヤの返却を記録します。</p>
        <div className="rounded-md border border-border-subtle bg-inset p-3 text-sm">
          <div className="text-secondary">
            顧客: <span className="text-primary">{item.customer?.name ?? item.customer_name ?? "—"}</span>
          </div>
          <div className="mt-1 text-secondary">
            {TIRE_TYPE_LABEL[item.tire_type]} / {item.tire_size ?? "サイズ未設定"} / {item.quantity}本
          </div>
          {item.storage_location && <div className="mt-1 text-secondary">保管場所: {item.storage_location}</div>}
        </div>
        <p className="text-xs text-muted">返却日: {todayStr}（本日）</p>
      </div>
      <DialogActions onClose={onClose} onSubmit={onConfirm} submitting={submitting} submitLabel="返却する" />
    </DialogShell>
  );
}

// ─── 顧客検索フック (type-to-filter) ───
function useCustomerSearch() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setCustomers([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}&per_page=20`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.customers ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setCustomers(list.map((c) => ({ id: String(c.id), name: String(c.name ?? "") })));
      } catch {
        /* オプショナル */
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [search]);

  return { customers, search, setSearch };
}

// ─── 顧客に紐付く車両フック ───
function useVehiclesForCustomer(customerId: string) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ per_page: "100", customer_id: customerId });
        const res = await fetch(`/api/admin/vehicles?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.vehicles ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setVehicles(
          list.map((v) => {
            const base = [v.maker, v.model].filter(Boolean).join(" ") || "車両";
            const plate = v.plate_display ? ` / ${String(v.plate_display)}` : "";
            return {
              id: String(v.id),
              label: `${base}${plate}`,
              maker: v.maker ? String(v.maker) : null,
              model: v.model ? String(v.model) : null,
              plate_display: v.plate_display ? String(v.plate_display) : null,
            };
          }),
        );
      } catch {
        /* オプショナル */
      }
    })();
    return () => {
      active = false;
    };
  }, [customerId]);
  return vehicles;
}

// ─── 共通パーツ ───
function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function DialogActions({
  onClose,
  onSubmit,
  submitting,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "処理中…" : submitLabel}
      </button>
    </div>
  );
}
