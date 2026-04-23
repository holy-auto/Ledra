"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BigActionButton from "@/components/pos/BigActionButton";
import POSSection from "@/components/pos/POSSection";
import { formatDate, formatJpy } from "@/lib/format";

/**
 * StorefrontJobWorkflow
 * ------------------------------------------------------------
 * 店頭モードの案件ワークフロー画面。
 *
 *  ① 現在のステータス + 次ステップの大型ボタン
 *  ② 顧客・車両サマリ (タブなし、常時表示)
 *  ③ 巨大ボタンによる主要アクション (証明書発行 / 請求書作成 / 予約画面で編集)
 *  ④ 紐付くドキュメント/証明書の簡易リスト
 *
 * 事務寄りの操作 (タブ / ドキュメント検索等) は管理モードで行う。
 */

type MenuItem = { menu_item_id?: string; name: string; price: number };

type Reservation = {
  id: string;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number | null;
  note: string | null;
  menu_items_json: MenuItem[] | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
} | null;

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin: string | null;
} | null;

type Certificate = {
  public_id: string;
  status: string;
  created_at: string;
  service_price: number | null;
  customer_name: string | null;
};

type Document = {
  id: string;
  doc_number: string | null;
  doc_type: string;
  status: string;
  total: number | null;
  issued_at: string | null;
  due_date: string | null;
};

const STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "来店・受付",
  in_progress: "作業中",
  completed: "完了・納車",
  cancelled: "キャンセル",
};

const ADVANCE_LABEL: Record<string, string> = {
  confirmed: "来店受付する",
  arrived: "作業を開始",
  in_progress: "作業を完了",
  completed: "完了済み",
};

const ADVANCE_HINT: Record<string, string> = {
  confirmed: "お客様が到着したらタップ",
  arrived: "作業を始めるときにタップ",
  in_progress: "すべての作業が終わったらタップ",
  completed: "次は会計・証明書発行へ",
};

interface Props {
  reservation: Reservation;
  customer: Customer;
  vehicle: Vehicle;
  certificates: Certificate[];
  documents: Document[];
}

export default function StorefrontJobWorkflow({ reservation, customer, vehicle, certificates, documents }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const currentStatus = reservation.status;
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUS_FLOW.indexOf(currentStatus as (typeof STATUS_FLOW)[number]);
  const nextStatus = currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null;

  const menuItems: MenuItem[] = Array.isArray(reservation.menu_items_json) ? reservation.menu_items_json : [];

  const invoices = useMemo(
    () => documents.filter((d) => ["invoice", "consolidated_invoice"].includes(d.doc_type)),
    [documents],
  );
  const estimates = useMemo(() => documents.filter((d) => d.doc_type === "estimate"), [documents]);

  const hasActiveCertificate = certificates.some((c) => c.status === "active");
  const hasPaidInvoice = invoices.some((d) => d.status === "paid");

  async function advance() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservation.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.error ?? j?.message ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const certificateNewUrl = (() => {
    const params = new URLSearchParams();
    if (reservation.vehicle_id) params.set("vehicle_id", reservation.vehicle_id);
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  const invoiceNewUrl = (() => {
    const params = new URLSearchParams();
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    if (reservation.vehicle_id) params.set("vehicle_id", reservation.vehicle_id);
    if (reservation.id) params.set("reservation_id", reservation.id);
    const qs = params.toString();
    return `/admin/invoices/new${qs ? `?${qs}` : ""}`;
  })();

  const vehicleText = vehicle ? [vehicle.maker, vehicle.model].filter(Boolean).join(" ") : null;

  return (
    <div className="space-y-6">
      {/* ─── ① ステータス + 次アクションの大型ボタン ─── */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-dim px-3 py-1 text-[11px] font-semibold text-accent-text">
            現在のステータス
          </span>
          <span className="text-xl font-bold text-primary">{STATUS_LABEL[currentStatus] ?? currentStatus}</span>
        </div>

        {/* 進行バー */}
        <ol className="mt-4 grid grid-cols-4 gap-1.5">
          {STATUS_FLOW.map((s, i) => {
            const active = !isCancelled && i === currentIndex;
            const done = !isCancelled && i < currentIndex;
            return (
              <li key={s} className="flex flex-col items-stretch gap-1">
                <span
                  className={`h-1.5 rounded-full ${done ? "bg-success" : active ? "bg-accent" : "bg-border-subtle"}`}
                />
                <span
                  className={`text-center text-[11px] font-medium ${
                    done ? "text-success-text" : active ? "text-accent-text" : "text-muted"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </span>
              </li>
            );
          })}
        </ol>

        {/* 次アクション */}
        {isCancelled ? (
          <div className="mt-5 rounded-xl border border-danger/20 bg-danger-dim px-3 py-2 text-sm text-danger-text">
            この案件はキャンセルされています。
            {reservation.cancel_reason && <span className="ml-2 text-[12px]">理由: {reservation.cancel_reason}</span>}
          </div>
        ) : nextStatus ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={advance}
              disabled={busy}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-accent bg-accent px-5 py-5 text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface/20">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </span>
              <span className="flex flex-col items-start">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">次の操作</span>
                <span className="text-xl font-bold leading-tight">
                  {busy ? "更新中..." : (ADVANCE_LABEL[currentStatus] ?? `${STATUS_LABEL[nextStatus]} へ進む`)}
                </span>
                <span className="mt-0.5 text-[12px] text-white/90">{ADVANCE_HINT[currentStatus] ?? ""}</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-success/20 bg-success-dim px-3 py-2 text-sm text-success-text">
            この案件の作業ステップはすべて完了しています。次は会計・証明書の発行へ進んでください。
          </div>
        )}

        {err && (
          <div className="mt-3 rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">
            {err}
          </div>
        )}
      </section>

      {/* ─── ② 顧客・車両サマリ ─── */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">お客様</div>
          {customer ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-lg font-bold text-primary">{customer.name}</div>
              {customer.company_name && <div className="text-sm text-secondary">{customer.company_name}</div>}
              <dl className="mt-2 space-y-1 text-sm">
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">電話</dt>
                    <dd>
                      <a href={`tel:${customer.phone}`} className="font-medium text-accent hover:underline">
                        {customer.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">メール</dt>
                    <dd className="text-primary">{customer.email}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-2">
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  顧客詳細を開く →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted">顧客は紐付いていません</div>
          )}
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">お車</div>
          {vehicle ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-lg font-bold text-primary">{vehicleText || "(車種未登録)"}</div>
              <dl className="mt-1 space-y-1 text-sm">
                {vehicle.plate_display && (
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">ナンバー</dt>
                    <dd className="font-medium text-primary">{vehicle.plate_display}</dd>
                  </div>
                )}
                {vehicle.year && (
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">年式</dt>
                    <dd className="text-primary">{vehicle.year}年</dd>
                  </div>
                )}
              </dl>
              <div className="mt-2">
                <Link
                  href={`/admin/vehicles/${vehicle.id}`}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  車両詳細を開く →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted">車両は紐付いていません</div>
          )}
        </div>
      </section>

      {/* ─── 予約情報 & メニュー ─── */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">予約内容</div>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">予約日</dt>
              <dd className="font-medium text-primary">{formatDate(reservation.scheduled_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">時間</dt>
              <dd className="text-primary">
                {reservation.start_time ?? "-"}
                {reservation.end_time ? ` 〜 ${reservation.end_time}` : ""}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">概算金額</dt>
              <dd className="font-bold text-primary">{formatJpy(reservation.estimated_amount)}</dd>
            </div>
          </dl>
          {reservation.note && (
            <div className="mt-2 rounded-lg bg-inset p-2 text-[12px] whitespace-pre-wrap text-primary">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">備考</span>
              <div className="mt-0.5">{reservation.note}</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            メニュー ({menuItems.length})
          </div>
          {menuItems.length === 0 ? (
            <div className="mt-2 text-sm text-muted">メニューは登録されていません</div>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle">
              {menuItems.map((m, i) => (
                <li
                  key={`${m.menu_item_id ?? m.name}-${i}`}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <span className="text-primary">{m.name}</span>
                  <span className="font-medium text-secondary">{formatJpy(m.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ─── ③ 主要アクション (大ボタン) ─── */}
      <POSSection title="この案件でよく使う操作" description="証明書発行・会計はここから 1 タップ" compact>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BigActionButton
            tone={hasActiveCertificate ? "neutral" : "primary"}
            href={certificateNewUrl}
            title="証明書を発行"
            subtitle={hasActiveCertificate ? "発行済みあり・追加発行する" : "この案件の施工証明書を作成"}
            hint={
              hasActiveCertificate ? `既存 ${certificates.filter((c) => c.status === "active").length}件` : undefined
            }
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone={hasPaidInvoice ? "neutral" : "warning"}
            href={invoiceNewUrl}
            title="請求書を作成"
            subtitle={hasPaidInvoice ? "入金済みあり・追加で作成" : "お会計の請求書を作る"}
            hint={invoices.length > 0 ? `既存 ${invoices.length}件` : undefined}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="neutral"
            href={`/admin/reservations?focus=${reservation.id}`}
            title="予約を編集"
            subtitle="時間・メニューを変更"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487 18.549 2.799a2.122 2.122 0 1 1 3 3L6.75 20.599 2.25 21.75l1.151-4.5L16.862 4.487Z"
                />
              </svg>
            }
          />
        </div>
      </POSSection>

      {/* ─── ④ 紐付く証明書・請求の簡易リスト ─── */}
      {(certificates.length > 0 || invoices.length > 0 || estimates.length > 0) && (
        <POSSection title="紐付くドキュメント" compact>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {certificates.length > 0 && (
              <div className="rounded-2xl border border-border-subtle bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold text-primary">証明書 ({certificates.length})</div>
                  <Link href={certificateNewUrl} className="text-xs font-semibold text-accent hover:underline">
                    + 追加
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {certificates.slice(0, 3).map((c) => (
                    <li key={c.public_id}>
                      <Link
                        href={`/admin/certificates/${c.public_id}`}
                        className="flex items-center justify-between rounded-lg bg-inset px-2.5 py-1.5 text-sm hover:bg-surface-hover"
                      >
                        <span className="font-mono text-xs text-accent">{c.public_id}</span>
                        <span className="text-[11px] text-secondary">{formatDate(c.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {certificates.length > 3 && (
                  <div className="mt-1.5 text-[11px] text-muted">ほか {certificates.length - 3} 件</div>
                )}
              </div>
            )}
            {(invoices.length > 0 || estimates.length > 0) && (
              <div className="rounded-2xl border border-border-subtle bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold text-primary">
                    請求・見積 ({invoices.length + estimates.length})
                  </div>
                  <Link href={invoiceNewUrl} className="text-xs font-semibold text-accent hover:underline">
                    + 追加
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {[...invoices, ...estimates].slice(0, 3).map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/admin/invoices/${d.id}`}
                        className="flex items-center justify-between rounded-lg bg-inset px-2.5 py-1.5 text-sm hover:bg-surface-hover"
                      >
                        <span className="font-mono text-xs text-accent">{d.doc_number ?? d.id.slice(0, 8)}</span>
                        <span className="font-medium text-primary">{formatJpy(d.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {invoices.length + estimates.length > 3 && (
                  <div className="mt-1.5 text-[11px] text-muted">ほか {invoices.length + estimates.length - 3} 件</div>
                )}
              </div>
            )}
          </div>
        </POSSection>
      )}
    </div>
  );
}
