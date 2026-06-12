"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatJpy, formatDate } from "@/lib/format";
import {
  MAINTENANCE_PACK_STATUS_LABEL,
  type MaintenancePackStatus,
} from "@/lib/validations/maintenance-pack";
import type { BadgeVariant } from "@/lib/statusMaps";

// ─── 型 ───
type CustomerRef = { id: string; name: string | null } | null;
type VehicleRef = {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
} | null;

type PackRow = {
  id: string;
  name: string;
  description: string | null;
  total_tickets: number;
  used_tickets: number;
  price: number | null;
  valid_from: string | null;
  valid_until: string | null;
  status: MaintenancePackStatus;
  sold_at: string | null;
  notes: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  customer: CustomerRef;
  vehicle: VehicleRef;
};

type ListResponse = { packs: PackRow[] };
type CustomerListResponse = { customers: { id: string; name: string | null }[] };

type FilterTab = "active" | "expired" | "exhausted" | "all";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "active", label: "アクティブ" },
  { key: "expired", label: "期限切れ" },
  { key: "exhausted", label: "使い切り" },
  { key: "all", label: "すべて" },
];

const STATUS_BADGE: Record<MaintenancePackStatus, BadgeVariant> = {
  active: "success",
  expired: "warning",
  exhausted: "default",
  cancelled: "danger",
};

// ─── ヘルパ ───
function vehicleLabel(v: VehicleRef): string | null {
  if (!v) return null;
  const parts = [v.maker, v.model].filter(Boolean).join(" ");
  if (v.plate_display && parts) return `${parts}（${v.plate_display}）`;
  return v.plate_display || parts || null;
}

/**
 * 残チケット数で色を決める: 0 -> red, 残り少 (<=20%) -> amber, それ以外 -> emerald。
 * グローバル theme トークンは success / warning / danger（= emerald / amber / red）
 * に対応するため、それらの Tailwind ユーティリティへマッピングする。
 */
function ticketTone(remaining: number, total: number): { bar: string; text: string } {
  if (remaining <= 0) return { bar: "bg-danger", text: "text-danger-text" };
  if (total > 0 && remaining / total <= 0.2) return { bar: "bg-warning", text: "text-warning-text" };
  return { bar: "bg-success", text: "text-success-text" };
}

/** プログレスバー: 10 セグメントのブロック文字列で残数を可視化 */
function TicketBar({ used, total }: { used: number; total: number }) {
  const remaining = Math.max(0, total - used);
  const tone = ticketTone(remaining, total);
  const segments = 10;
  const filled = total > 0 ? Math.round((remaining / total) * segments) : 0;
  const blocks = "█".repeat(filled) + "░".repeat(Math.max(0, segments - filled));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted">チケット残数</span>
        <span className={`font-semibold ${tone.text}`}>
          {remaining}/{total}枚
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-surface-hover">
        <div
          className={`h-full rounded-full transition-all ${tone.bar}`}
          style={{ width: `${total > 0 ? (remaining / total) * 100 : 0}%` }}
        />
      </div>
      <div className={`font-mono text-[11px] tracking-tight ${tone.text}`} aria-hidden>
        {blocks}
      </div>
    </div>
  );
}

export default function MaintenancePacksClient() {
  const [tab, setTab] = useState<FilterTab>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const swrKey = `/api/admin/maintenance-packs?status=${tab}`;
  const { data, isLoading, error, mutate } = useSWR<ListResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });

  const packs = data?.packs ?? [];

  const handleUse = async (pack: PackRow) => {
    const remaining = pack.total_tickets - pack.used_tickets;
    if (remaining <= 0) {
      alert("このパックはチケットを使い切っています。");
      return;
    }
    if (
      !confirm(
        `「${pack.name}」のチケットを 1 枚使用します。\n残り ${remaining} 枚 → ${remaining - 1} 枚 になります。よろしいですか？`,
      )
    )
      return;
    setBusyId(pack.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/maintenance-packs/${pack.id}/use`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      await mutate();
    } catch (e) {
      setErrorMsg("チケット使用に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        tag="メンテナンス"
        title="メンテパック管理"
        description="「3年保証メンテパック」などのチケット制パックを販売・管理します。来店ごとにチケットを 1 枚消費して残数を追跡できます。"
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            + 新規パック
          </button>
        }
      />

      {/* フィルタタブ */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-accent bg-accent-dim text-accent-text"
                : "border-border-default text-secondary hover:bg-surface-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="glass-card border-l-4 border-danger p-3 text-xs text-danger-text">{errorMsg}</div>
      )}

      {isLoading && <div className="text-sm text-muted">読み込み中…</div>}
      {error && (
        <div className="glass-card p-4 text-sm text-danger-text">
          {error instanceof Error ? error.message : "読み込みに失敗しました"}
        </div>
      )}

      {data && packs.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="text-3xl">🎟️</div>
          <div className="mt-2 text-sm font-medium text-primary">
            {tab === "active" ? "アクティブなメンテパックはありません" : "該当するメンテパックはありません"}
          </div>
          <p className="mt-1 text-xs text-muted">
            「+ 新規パック」から 3 年保証メンテパックなどを販売・登録できます。
          </p>
        </div>
      )}

      {/* 一覧（カード形式） */}
      <div className="grid gap-3 sm:grid-cols-2">
        {packs.map((pack) => {
          const customerName = pack.customer?.name ?? null;
          const vLabel = vehicleLabel(pack.vehicle);
          const remaining = pack.total_tickets - pack.used_tickets;
          return (
            <div key={pack.id} className="glass-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-primary">{pack.name}</div>
                  {pack.description && (
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{pack.description}</div>
                  )}
                </div>
                <Badge variant={STATUS_BADGE[pack.status]}>
                  {MAINTENANCE_PACK_STATUS_LABEL[pack.status]}
                </Badge>
              </div>

              {(customerName || vLabel) && (
                <div className="space-y-0.5 text-[12px] text-secondary">
                  {customerName && (
                    <div className="flex gap-1.5">
                      <span className="text-muted">顧客</span>
                      <span className="truncate">{customerName}</span>
                    </div>
                  )}
                  {vLabel && (
                    <div className="flex gap-1.5">
                      <span className="text-muted">車両</span>
                      <span className="truncate">{vLabel}</span>
                    </div>
                  )}
                </div>
              )}

              <TicketBar used={pack.used_tickets} total={pack.total_tickets} />

              <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-[11px] text-secondary">
                <span>
                  有効期限{" "}
                  {pack.valid_until ? (
                    <span className="text-primary">{formatDate(pack.valid_until)}</span>
                  ) : (
                    <span className="text-muted">無期限</span>
                  )}
                </span>
                <span className="text-primary">{pack.price != null ? formatJpy(pack.price) : "—"}</span>
              </div>

              <button
                type="button"
                onClick={() => handleUse(pack)}
                disabled={busyId === pack.id || remaining <= 0 || pack.status !== "active"}
                className="btn-secondary w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === pack.id ? "処理中…" : remaining <= 0 ? "使い切り" : "チケットを使用"}
              </button>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreatePackDialog
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

// ─── 新規作成ダイアログ ───
function CreatePackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalTickets, setTotalTickets] = useState("5");
  const [price, setPrice] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 顧客検索 (datalist): クエリが 1 文字以上のときだけ叩く
  const customerKey = customerQuery.trim().length >= 1
    ? `/api/admin/customers?q=${encodeURIComponent(customerQuery.trim())}`
    : null;
  const { data: customerData } = useSWR<CustomerListResponse>(customerKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 1000,
    keepPreviousData: true,
  });
  const customers = useMemo(() => customerData?.customers ?? [], [customerData]);

  // datalist の選択値 (顧客名) から customer_id を解決
  const resolveCustomer = (value: string) => {
    setCustomerQuery(value);
    const match = customers.find((c) => (c.name ?? "") === value);
    setCustomerId(match?.id ?? "");
  };

  const submit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("パック名は必須です。");
      return;
    }
    const tickets = Number(totalTickets);
    if (!Number.isInteger(tickets) || tickets < 1) {
      setFormError("チケット総数は 1 以上の整数で指定してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/maintenance-packs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          total_tickets: tickets,
          price: price.trim() ? Number(price) : null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          customer_id: customerId || null,
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
          <h2 className="text-base font-semibold text-primary">新規メンテパック</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            ✕
          </button>
        </div>

        {formError && (
          <div className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger-text">
            {formError}
          </div>
        )}

        <Field label="パック名" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="3年保証メンテパック"
            className="input-field w-full"
            maxLength={120}
          />
        </Field>

        <Field label="説明">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="年2回の点検・水アカ除去を含む保証メンテナンス"
            className="input-field min-h-[60px] w-full"
            maxLength={2000}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="チケット総数" required>
            <input
              type="number"
              min={1}
              max={999}
              value={totalTickets}
              onChange={(e) => setTotalTickets(e.target.value)}
              className="input-field w-full"
            />
          </Field>
          <Field label="価格（円）">
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className="input-field w-full"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="有効期間（開始）">
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="input-field w-full"
            />
          </Field>
          <Field label="有効期間（終了）">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input-field w-full"
            />
          </Field>
        </div>

        <Field label="顧客（任意・名前で検索）">
          <input
            list="mp-customer-list"
            value={customerQuery}
            onChange={(e) => resolveCustomer(e.target.value)}
            placeholder="顧客名を入力して選択"
            className="input-field w-full"
          />
          <datalist id="mp-customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name ?? ""} />
            ))}
          </datalist>
          {customerQuery.trim() && !customerId && (
            <p className="mt-1 text-[11px] text-warning-text">
              一覧から顧客を選択してください（未選択のままだと紐付けされません）。
            </p>
          )}
        </Field>

        <Field label="メモ">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field min-h-[48px] w-full"
            maxLength={2000}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            キャンセル
          </button>
          <button type="button" onClick={submit} disabled={submitting} className="btn-primary text-sm">
            {submitting ? "作成中…" : "作成"}
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
