"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";

/**
 * WalkinJobClient
 * ------------------------------------------------------------
 * 予約なし来店客 (飛び込み) 向けの軽量 intake フォーム。
 * 最小 2 フィールド (タイトルのみ必須) で reservation を作成し、
 * そのまま /admin/jobs/[id] に遷移。後は通常の案件ワークフローに合流する。
 */

type Customer = { id: string; name: string; phone?: string | null };
type Vehicle = {
  id: string;
  customer_id?: string | null;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function WalkinJobClient() {
  const router = useRouter();

  const [title, setTitle] = useState(`飛び込み案件 ${today()}`);
  const [customerId, setCustomerId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [estimatedAmount, setEstimatedAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [initialStatus, setInitialStatus] = useState<"arrived" | "in_progress">("arrived");
  // 飛び込み案件では「その場で作業」か「別日に作業 (＝まず見積書)」か
  // 状況によって変わるため、都度選ばせる。未選択時は送信不可。
  type EstimateChoice = "now" | "skip";
  const [estimateChoice, setEstimateChoice] = useState<EstimateChoice | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 初期マスターデータ取得
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/customers", { cache: "no-store" });
        const j = await parseJsonSafe(res);
        if (res.ok && j?.customers) {
          setCustomers(
            j.customers.map((c: any) => ({
              id: c.id,
              name: c.name,
              phone: c.phone ?? null,
            })),
          );
        }
      } catch {
        /* noop */
      } finally {
        setLoadingMasters(false);
      }
    })();
  }, []);

  // 顧客変更時に車両を絞り込み
  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehicleId("");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers?action=vehicles&customer_id=${encodeURIComponent(customerId)}`, {
          cache: "no-store",
        });
        const j = await parseJsonSafe(res);
        if (res.ok && j?.vehicles) {
          setVehicles(j.vehicles);
        }
      } catch {
        setVehicles([]);
      }
    })();
  }, [customerId]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 100);
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))).slice(0, 100);
  }, [customers, customerQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErr("案件タイトルを入力してください");
      return;
    }
    if (estimateChoice == null) {
      setErr("見積書の扱いを選択してください");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          scheduled_date: today(),
          customer_id: customerId || undefined,
          vehicle_id: vehicleId || undefined,
          estimated_amount: estimatedAmount,
          note: note.trim() || undefined,
          status: initialStatus, // 飛び込みなので arrived から開始
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.reservation?.id) {
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      // 見積書を作成する場合: 帳票の見積書作成タブへ、顧客を引き継いで遷移。
      // スキップする場合: そのままワークフロー画面へ。
      if (estimateChoice === "now") {
        const params = new URLSearchParams({ view: "estimate", create: "1" });
        if (customerId) params.set("customer_id", customerId);
        router.push(`/admin/invoices?${params.toString()}`);
      } else {
        router.push(`/admin/jobs/${j.reservation.id}`);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card padding="compact" variant="inset">
        <p className="text-[13px] text-secondary leading-relaxed">
          飛び込みの案件を即座にワークフローに乗せます。予約日は <strong>本日</strong>、 ステータスは「
          <strong>来店・受付</strong>」で作成され、そのまま作業を開始できます。
          顧客・車両は後からでも紐付けできるので、空のままでも OK です。
        </p>
      </Card>

      <Card padding="default">
        <div className="space-y-4">
          {/* 案件タイトル */}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">
              案件タイトル <span className="text-danger">*</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: ガラスコーティング (飛び込み)"
              className="w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
              required
            />
          </label>

          {/* 初期ステータス */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">開始ステータス</span>
            <div className="flex gap-2">
              {(
                [
                  { k: "arrived", label: "🚪 来店・受付", hint: "これから作業開始" },
                  { k: "in_progress", label: "🔧 作業中", hint: "既に作業中" },
                ] as const
              ).map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setInitialStatus(s.k)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                    initialStatus === s.k
                      ? "border-accent bg-accent-dim text-accent-text"
                      : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <div>{s.label}</div>
                  <div className="text-[11px] font-normal opacity-75 mt-0.5">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 見積書の扱い (都度選択) */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">
              見積書 <span className="text-danger">*</span>
            </span>
            <p className="text-[11px] text-muted">
              飛び込み案件はその場作業か別日作業か都度異なるため、ここで選択してください。
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  {
                    k: "now",
                    label: "📝 見積書を作成",
                    hint: "別日に作業 / 事前に金額を提示する場合",
                  },
                  {
                    k: "skip",
                    label: "⏭ 見積もり不要",
                    hint: "その場で作業するので見積書は作らない",
                  },
                ] as const
              ).map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setEstimateChoice(s.k)}
                  className={`flex-1 min-w-[160px] rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                    estimateChoice === s.k
                      ? "border-accent bg-accent-dim text-accent-text"
                      : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <div>{s.label}</div>
                  <div className="text-[11px] font-normal opacity-75 mt-0.5">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 顧客・車両 (任意) */}
      <Card padding="default">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">顧客・車両 (任意)</div>
            <p className="text-[12px] text-secondary mt-0.5">
              あとからでも紐付けできます。飛び込みで情報がまだ無ければ空のまま進めて OK。
            </p>
          </div>
          <Link
            href="/admin/customers?create=1"
            target="_blank"
            className="text-xs text-accent hover:underline whitespace-nowrap"
          >
            + 新規顧客登録
          </Link>
        </div>

        <div className="space-y-4">
          {/* 顧客検索 */}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">顧客</span>
            <input
              type="text"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="名前・電話で検索..."
              className="w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
              disabled={loadingMasters}
            />
            {loadingMasters ? (
              <div className="text-xs text-muted">読み込み中...</div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border-subtle divide-y divide-border-subtle">
                <button
                  type="button"
                  onClick={() => setCustomerId("")}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    customerId === ""
                      ? "bg-accent-dim text-accent-text font-medium"
                      : "bg-surface hover:bg-surface-hover text-secondary"
                  }`}
                >
                  (顧客を紐付けない)
                </button>
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomerId(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      customerId === c.id
                        ? "bg-accent-dim text-accent-text font-medium"
                        : "bg-surface hover:bg-surface-hover text-primary"
                    }`}
                  >
                    {c.name}
                    {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted">該当する顧客がありません</div>
                )}
              </div>
            )}
          </label>

          {/* 車両 */}
          {customerId && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-secondary tracking-wide uppercase">車両</span>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
              >
                <option value="">(車両を紐付けない)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.maker, v.model, v.year ? `${v.year}年` : null].filter(Boolean).join(" ")}
                    {v.plate_display ? ` / ${v.plate_display}` : ""}
                  </option>
                ))}
              </select>
              {vehicles.length === 0 && (
                <div className="text-xs text-muted">この顧客に紐付く車両が登録されていません。後から追加できます。</div>
              )}
            </label>
          )}
        </div>
      </Card>

      {/* 概算金額・メモ */}
      <Card padding="default">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">概算金額 (円)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={estimatedAmount || ""}
              onChange={(e) => setEstimatedAmount(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary tracking-wide uppercase">備考</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="依頼内容・要望など"
              className="w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
            />
          </label>
        </div>
      </Card>

      {err && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim px-4 py-3 text-sm text-danger-text">{err}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/reservations" className="btn-secondary px-4 py-2">
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={submitting || !title.trim() || estimateChoice == null}
          className="btn-primary px-6 py-2.5 disabled:opacity-50"
        >
          {submitting
            ? "作成中..."
            : estimateChoice === "now"
              ? "🧭 案件を開始 → 見積書作成へ"
              : estimateChoice === "skip"
                ? "🧭 案件を開始 →"
                : "🧭 案件を開始 →"}
        </button>
      </div>
    </form>
  );
}
