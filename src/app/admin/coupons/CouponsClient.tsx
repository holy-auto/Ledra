"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { couponDiscountTypes, couponIssueChannels, type CouponDiscountType } from "@/lib/validations/coupon";

// ─── 型定義 ──────────────────────────────────────────────────────
interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  notes: string | null;
  issued_count: number;
  created_at: string;
  updated_at: string;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
}

type IssueChannel = (typeof couponIssueChannels)[number];

// ─── 表示メタ ─────────────────────────────────────────────────────
const CHANNEL_LABEL: Record<IssueChannel, string> = {
  manual: "手渡し / 手動",
  line: "LINE",
  sms: "SMS",
  email: "メール",
};

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function formatDiscount(c: Pick<Coupon, "discount_type" | "discount_value">): string {
  return c.discount_type === "percent" ? `${c.discount_value}%OFF` : `¥${c.discount_value.toLocaleString("ja-JP")}引き`;
}

function formatDateRange(from: string | null, until: string | null): string {
  if (!from && !until) return "期限なし";
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("ja-JP");
  if (from && until) return `${fmt(from)} 〜 ${fmt(until)}`;
  if (until) return `${fmt(until)} まで`;
  return `${fmt(from as string)} から`;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function CouponsClient() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  // ステータスタブ: 有効 / 停止中 / すべて。全件取得しクライアント側で振り分ける。
  const [couponTab, setCouponTab] = useState<"active" | "inactive" | "all">("active");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<Coupon | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/coupons?active_only=false`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
    } catch (e) {
      console.error(e);
      showToast("error", "クーポンの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleCopy = useCallback(
    async (coupon: Coupon) => {
      try {
        await navigator.clipboard.writeText(coupon.code);
        setCopiedId(coupon.id);
        setTimeout(() => setCopiedId((cur) => (cur === coupon.id ? null : cur)), 1500);
      } catch {
        showToast("error", "コピーに失敗しました");
      }
    },
    [showToast],
  );

  const handleToggleActive = useCallback(
    async (coupon: Coupon) => {
      setBusyId(coupon.id);
      try {
        const res = await fetch("/api/admin/coupons", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "update failed");
        }
        showToast("success", coupon.is_active ? "クーポンを停止しました" : "クーポンを再開しました");
        await fetchCoupons();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [fetchCoupons, showToast],
  );

  const stats = useMemo(() => {
    const active = coupons.filter((c) => c.is_active).length;
    const totalIssued = coupons.reduce((sum, c) => sum + c.issued_count, 0);
    const totalUsed = coupons.reduce((sum, c) => sum + c.used_count, 0);
    return { active, totalIssued, totalUsed, inactive: coupons.length - active };
  }, [coupons]);

  const visibleCoupons = useMemo(() => {
    if (couponTab === "active") return coupons.filter((c) => c.is_active);
    if (couponTab === "inactive") return coupons.filter((c) => !c.is_active);
    return coupons;
  }, [coupons, couponTab]);

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {/* ヘッダー + ステータスタブ（L3 ページバー） */}
      <PageHeader
        tag="販促"
        title="クーポン管理"
        meta={
          <span className="text-xs text-muted">
            発行 <span className="font-semibold text-primary">{stats.totalIssued}</span> ・ 利用{" "}
            <span className="font-semibold text-primary">{stats.totalUsed}</span>
          </span>
        }
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新規クーポン
          </button>
        }
        tabs={[
          { key: "active", label: "有効", badge: stats.active },
          { key: "inactive", label: "停止中", badge: stats.inactive },
          { key: "all", label: "すべて", badge: coupons.length },
        ]}
        activeTab={couponTab}
        onTabSelect={(k) => setCouponTab(k as "active" | "inactive" | "all")}
      />

      {/* 一覧 */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : visibleCoupons.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">
            {coupons.length === 0
              ? "クーポンがまだありません。「新規クーポン」から作成してください。"
              : "この条件のクーポンはありません。"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleCoupons.map((c) => {
            const isBusy = busyId === c.id;
            const usageLabel =
              c.max_uses != null ? `${c.used_count}回使用 / 上限${c.max_uses}回` : `${c.used_count}回使用`;
            return (
              <div key={c.id} className="glass-card flex flex-col rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-primary">{c.name}</div>
                    <button
                      type="button"
                      onClick={() => handleCopy(c)}
                      title="コードをコピー"
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-inset px-2 py-0.5 font-mono text-xs text-secondary transition-colors hover:text-primary"
                    >
                      <span>{c.code}</span>
                      {copiedId === c.id ? (
                        <span className="text-success-text">✓ コピー済</span>
                      ) : (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.is_active ? "bg-success-dim text-success-text" : "bg-inset text-muted"
                    }`}
                  >
                    {c.is_active ? "有効" : "停止中"}
                  </span>
                </div>

                <div className="mt-3 text-lg font-bold text-accent">{formatDiscount(c)}</div>
                {(c.min_purchase ?? 0) > 0 && (
                  <div className="text-xs text-muted">¥{(c.min_purchase ?? 0).toLocaleString("ja-JP")}以上で利用可</div>
                )}
                {c.description && <p className="mt-1 line-clamp-2 text-xs text-secondary">{c.description}</p>}

                <div className="mt-3 space-y-1 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary">有効期限:</span>
                    <span>{formatDateRange(c.valid_from, c.valid_until)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary">利用状況:</span>
                    <span>{usageLabel}</span>
                    <span className="text-muted">·</span>
                    <span>発行 {c.issued_count} 件</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
                  <button
                    disabled={isBusy || !c.is_active}
                    onClick={() => setIssueTarget(c)}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    顧客に発行
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => handleToggleActive(c)}
                    className="rounded-lg bg-inset px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                  >
                    {c.is_active ? "停止" : "再開"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規作成ダイアログ */}
      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            showToast("success", "クーポンを作成しました");
            await fetchCoupons();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 発行ダイアログ */}
      {issueTarget && (
        <IssueDialog
          coupon={issueTarget}
          onClose={() => setIssueTarget(null)}
          onIssued={async () => {
            setIssueTarget(null);
            showToast("success", "クーポンを発行しました");
            await fetchCoupons();
          }}
          onError={(msg) => showToast("error", msg)}
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

// ─── 新規作成ダイアログ ───
function CreateDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<CouponDiscountType>("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      onError("クーポン名を入力してください。");
      return;
    }
    const value = Number(discountValue);
    if (!Number.isInteger(value) || value < 1) {
      onError("割引額/割引率は 1 以上の整数で入力してください。");
      return;
    }
    if (discountType === "percent" && value > 100) {
      onError("割引率は 1〜100 の整数で入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          name: name.trim(),
          description: description.trim() || null,
          discount_type: discountType,
          discount_value: value,
          min_purchase: minPurchase ? Number(minPurchase) : 0,
          max_uses: maxUses ? Number(maxUses) : null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="新規クーポン" onClose={onClose}>
      <div className="space-y-4">
        <Field label="クーポン名" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 初回コーティング 10%OFF"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <Field label="コード（空白で自動生成）">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例: WELCOME10 (空欄で自動生成)"
            className={`w-full font-mono ${inputCls}`}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="割引種別">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
              className={`w-full ${inputCls}`}
            >
              {couponDiscountTypes.map((t) => (
                <option key={t} value={t}>
                  {t === "fixed" ? "金額（円）" : "割引率（%）"}
                </option>
              ))}
            </select>
          </Field>
          <Field label={discountType === "percent" ? "割引率 (1-100)" : "割引額 (円)"} required>
            <input
              type="number"
              min={1}
              max={discountType === "percent" ? 100 : undefined}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "10" : "1000"}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="最低購入金額 (円)">
            <input
              type="number"
              min={0}
              value={minPurchase}
              onChange={(e) => setMinPurchase(e.target.value)}
              placeholder="0"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="最大利用回数">
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="無制限"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="有効期間（開始）">
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="有効期間（終了）">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <Field label="説明（任意）">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="例: 新規ご来店のお客様限定"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="作成する" />
    </DialogShell>
  );
}

// ─── 発行ダイアログ ───
function IssueDialog({
  coupon,
  onClose,
  onIssued,
  onError,
}: {
  coupon: Coupon;
  onClose: () => void;
  onIssued: () => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [channel, setChannel] = useState<IssueChannel>("manual");
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  // 顧客検索 (debounce): /api/admin/customers?q=
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ per_page: "20" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/admin/customers?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.customers ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setCustomers(
          list.map((c) => ({
            id: String(c.id),
            name: String(c.name ?? ""),
            phone: c.phone ? String(c.phone) : null,
          })),
        );
      } catch {
        /* 検索失敗時は候補を空に */
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/coupons/${encodeURIComponent(coupon.id)}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          expires_days: expiresDays ? Number(expiresDays) : null,
          issue_channel: channel,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "issue failed");
      }
      onIssued();
    } catch (e) {
      onError(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title={`「${coupon.name}」を発行`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="顧客を検索">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・電話・メールで検索"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <div className="max-h-48 overflow-y-auto rounded-md border border-border-subtle">
          <button
            type="button"
            onClick={() => setCustomerId("")}
            className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
              customerId === "" ? "bg-accent-dim text-accent-text" : "text-secondary"
            }`}
          >
            （顧客を指定しない）
          </button>
          {searching && customers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">検索中…</div>
          ) : customers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">該当する顧客がいません</div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomerId(c.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
                  customerId === c.id ? "bg-accent-dim text-accent-text" : "text-primary"
                }`}
              >
                <span className="truncate">{c.name}</span>
                {c.phone && <span className="ml-2 shrink-0 text-xs text-muted">{c.phone}</span>}
              </button>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="有効期限（日数）">
            <input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="無期限"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="発行チャンネル">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as IssueChannel)}
              className={`w-full ${inputCls}`}
            >
              {couponIssueChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="発行する" />
    </DialogShell>
  );
}

// ─── 共通ダイアログパーツ ───
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
