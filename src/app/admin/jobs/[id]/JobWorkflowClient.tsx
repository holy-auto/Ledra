"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";

/**
 * JobWorkflowClient
 * ------------------------------------------------------------
 * 案件 (予約) 1 件のステータス遷移・関連ドキュメント・請求を
 * 1 画面でまとめて操作する統合ワークスペース。
 *
 * - 上部: ステップインジケータ (confirmed→arrived→in_progress→completed)
 * - 下部: タブ (サマリ / 顧客・車両 / 証明書 / 請求)
 * - 右サイド: 次アクションパネル (証明書発行・請求作成・ステータス進行)
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

const STATUS_HINT: Record<string, string> = {
  confirmed: "予約を受け付けました。来店確認を待ちます。",
  arrived: "お客様が来店しました。作業を開始してください。",
  in_progress: "作業中です。完了したら証明書発行 → 納車に進みます。",
  completed: "作業が完了しました。請求書発行 → 入金確認を行います。",
  cancelled: "この予約はキャンセルされています。",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
  estimate: "見積書",
  receipt: "領収書",
  delivery: "納品書",
};

const DOC_STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  sent: "送付済",
  paid: "入金済",
  overdue: "期限超過",
  cancelled: "キャンセル",
};

const docStatusVariant = (s: string) => {
  switch (s) {
    case "draft":
      return "default" as const;
    case "sent":
      return "info" as const;
    case "paid":
      return "success" as const;
    case "overdue":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "default" as const;
  }
};

const certStatusVariant = (s: string) => {
  switch (s) {
    case "active":
      return "success" as const;
    case "void":
      return "danger" as const;
    case "draft":
      return "default" as const;
    case "expired":
      return "warning" as const;
    default:
      return "default" as const;
  }
};

type TabKey = "summary" | "parties" | "certificates" | "billing";

interface Props {
  reservation: Reservation;
  customer: Customer;
  vehicle: Vehicle;
  certificates: Certificate[];
  documents: Document[];
}

export default function JobWorkflowClient({ reservation, customer, vehicle, certificates, documents }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("summary");
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
  const otherDocs = useMemo(
    () => documents.filter((d) => !["invoice", "consolidated_invoice", "estimate"].includes(d.doc_type)),
    [documents],
  );

  const hasActiveCertificate = certificates.some((c) => c.status === "active");
  const hasPaidInvoice = invoices.some((d) => d.status === "paid");

  async function advanceStatus(_target?: string) {
    // /advance エンドポイントに寄せる。
    // - テンプレート設定済み: 現在ステップを完了 → 次ステップ開始。is_customer_visible
    //   なステップであれば LINE 通知 (sendProgressUpdate) が自動で発火する。
    // - テンプレート未設定: レガシーフロー (confirmed→arrived→in_progress→completed) を
    //   エンドポイント側が内部で処理するので、呼び出し側は単に叩くだけで OK。
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservation.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? j?.message ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 証明書発行 URL (車両・顧客情報を引き継ぎ)
  const certificateNewUrl = (() => {
    const params = new URLSearchParams();
    if (reservation.vehicle_id) params.set("vehicle_id", reservation.vehicle_id);
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  // 請求書作成 URL (顧客・車両を引き継ぎ、新規作成フォームを自動で開く)
  const invoiceNewUrl = (() => {
    const params = new URLSearchParams();
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    if (reservation.vehicle_id) params.set("vehicle_id", reservation.vehicle_id);
    const qs = params.toString();
    return `/admin/invoices/new${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="space-y-6">
      {/* ─── Status Stepper ────────────────────────────── */}
      <Card padding="default">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Status</div>
            <div className="flex items-center gap-2">
              <Badge variant={isCancelled ? "danger" : currentStatus === "completed" ? "success" : "info"}>
                {STATUS_LABEL[currentStatus] ?? currentStatus}
              </Badge>
              <span className="text-[13px] text-secondary">{STATUS_HINT[currentStatus] ?? ""}</span>
            </div>
          </div>
          {nextStatus && !isCancelled && (
            <button
              onClick={() => advanceStatus(nextStatus)}
              disabled={busy}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              {busy ? "更新中..." : `${STATUS_LABEL[nextStatus]} へ進む →`}
            </button>
          )}
        </div>

        {/* Step indicator */}
        <ol className="mt-5 flex items-center gap-2 overflow-x-auto">
          {STATUS_FLOW.map((s, i) => {
            const active = !isCancelled && i === currentIndex;
            const done = !isCancelled && i < currentIndex;
            return (
              <li key={s} className="flex items-center gap-2 whitespace-nowrap">
                <div
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                    active
                      ? "border-accent bg-accent-dim text-accent-text"
                      : done
                        ? "border-success/20 bg-success-dim text-success-text"
                        : "border-border-default bg-inset text-secondary"
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/60 text-[11px] font-bold">
                    {done ? "✓" : i + 1}
                  </span>
                  {STATUS_LABEL[s]}
                </div>
                {i < STATUS_FLOW.length - 1 && <span className="text-muted">→</span>}
              </li>
            );
          })}
        </ol>

        {err && (
          <div className="mt-4 rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">
            {err}
          </div>
        )}
      </Card>

      {/* ─── Quick Actions ─────────────────────────────── */}
      <Card padding="default">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase mb-3">Next Actions</div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={certificateNewUrl}
            className={`btn-primary text-sm px-4 py-2 ${hasActiveCertificate ? "opacity-60" : ""}`}
          >
            🪪 証明書を発行
            {hasActiveCertificate && <span className="ml-2 text-[10px]">(発行済)</span>}
          </Link>
          <Link
            href={invoiceNewUrl}
            className={`btn-secondary text-sm px-4 py-2 ${hasPaidInvoice ? "opacity-60" : ""}`}
          >
            💰 請求書を作成
            {hasPaidInvoice && <span className="ml-2 text-[10px]">(入金済あり)</span>}
          </Link>
          {reservation.customer_id && (
            <Link href={`/admin/customers/${reservation.customer_id}`} className="btn-secondary text-sm px-4 py-2">
              👤 顧客詳細
            </Link>
          )}
          {reservation.vehicle_id && (
            <Link href={`/admin/vehicles/${reservation.vehicle_id}`} className="btn-secondary text-sm px-4 py-2">
              🚗 車両詳細
            </Link>
          )}
          <Link href={`/admin/reservations?focus=${reservation.id}`} className="btn-secondary text-sm px-4 py-2">
            📅 予約画面で編集
          </Link>
        </div>
      </Card>

      {/* ─── Tabs ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-subtle">
        {(
          [
            { k: "summary", label: "サマリ" },
            { k: "parties", label: "顧客・車両" },
            { k: "certificates", label: `証明書 (${certificates.length})` },
            {
              k: "billing",
              label: `請求・見積 (${invoices.length + estimates.length})`,
            },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.k ? "border-accent text-primary" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Summary ──────────────────────────────── */}
      {tab === "summary" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="default">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">予約内容</div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-secondary">予約日</dt>
                <dd className="text-primary font-medium">{formatDate(reservation.scheduled_date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary">時間</dt>
                <dd className="text-primary">
                  {reservation.start_time ?? "-"}
                  {reservation.end_time ? ` 〜 ${reservation.end_time}` : ""}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary">概算金額</dt>
                <dd className="text-primary font-semibold">{formatJpy(reservation.estimated_amount)}</dd>
              </div>
              {reservation.note && (
                <div>
                  <dt className="text-secondary mb-1">備考</dt>
                  <dd className="text-primary whitespace-pre-wrap rounded-lg bg-inset p-2 text-[13px]">
                    {reservation.note}
                  </dd>
                </div>
              )}
              {reservation.cancel_reason && (
                <div>
                  <dt className="text-danger-text mb-1">キャンセル理由</dt>
                  <dd className="text-danger-text whitespace-pre-wrap rounded-lg bg-danger-dim p-2 text-[13px]">
                    {reservation.cancel_reason}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card padding="default">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              メニュー ({menuItems.length})
            </div>
            {menuItems.length === 0 ? (
              <div className="mt-4 text-sm text-muted">メニューは登録されていません</div>
            ) : (
              <ul className="mt-3 divide-y divide-border-subtle">
                {menuItems.map((m, i) => (
                  <li
                    key={`${m.menu_item_id ?? m.name}-${i}`}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-primary">{m.name}</span>
                    <span className="text-secondary">{formatJpy(m.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ─── Tab: Parties ──────────────────────────────── */}
      {tab === "parties" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="default">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">顧客</div>
              {customer && (
                <Link href={`/admin/customers/${customer.id}`} className="text-xs text-accent hover:underline">
                  詳細を開く →
                </Link>
              )}
            </div>
            {customer ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-secondary">氏名</dt>
                  <dd className="text-primary font-medium">{customer.name}</dd>
                </div>
                {customer.company_name && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">会社名</dt>
                    <dd className="text-primary">{customer.company_name}</dd>
                  </div>
                )}
                {customer.email && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">メール</dt>
                    <dd className="text-primary">{customer.email}</dd>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">電話</dt>
                    <dd className="text-primary">{customer.phone}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="mt-4 text-sm text-muted">顧客は紐付いていません</div>
            )}
          </Card>

          <Card padding="default">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">車両</div>
              {vehicle && (
                <Link href={`/admin/vehicles/${vehicle.id}`} className="text-xs text-accent hover:underline">
                  詳細を開く →
                </Link>
              )}
            </div>
            {vehicle ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-secondary">メーカー / 車種</dt>
                  <dd className="text-primary font-medium">
                    {vehicle.maker} {vehicle.model}
                  </dd>
                </div>
                {vehicle.year && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">年式</dt>
                    <dd className="text-primary">{vehicle.year}年</dd>
                  </div>
                )}
                {vehicle.plate_display && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">ナンバー</dt>
                    <dd className="text-primary">{vehicle.plate_display}</dd>
                  </div>
                )}
                {vehicle.vin && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">車台番号</dt>
                    <dd className="text-primary font-mono text-[12px]">{vehicle.vin}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="mt-4 text-sm text-muted">車両は紐付いていません</div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Tab: Certificates ─────────────────────────── */}
      {tab === "certificates" && (
        <Card padding="none">
          <div className="flex items-center justify-between border-b border-border-subtle p-5">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Certificates</div>
              <div className="mt-1 text-base font-semibold text-primary">紐付き証明書 ({certificates.length}件)</div>
            </div>
            <Link href={certificateNewUrl} className="btn-primary text-xs px-3 py-1.5">
              + 新規発行
            </Link>
          </div>
          {certificates.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">この車両・顧客に紐付く証明書はまだありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">証明書ID</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">
                      ステータス
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">施工料金</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">発行日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {certificates.map((cert) => (
                    <tr key={cert.public_id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/certificates/${cert.public_id}`}
                          className="font-mono text-accent underline hover:text-accent"
                        >
                          {cert.public_id}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={certStatusVariant(cert.status)}>{cert.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-secondary">{cert.customer_name ?? "-"}</td>
                      <td className="px-5 py-3.5 text-secondary">{formatJpy(cert.service_price)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-secondary">{formatDate(cert.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ─── Tab: Billing ──────────────────────────────── */}
      {tab === "billing" && (
        <div className="space-y-4">
          <Card padding="none">
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Invoices</div>
                <div className="mt-1 text-base font-semibold text-primary">請求書 ({invoices.length}件)</div>
              </div>
              <Link href={invoiceNewUrl} className="btn-primary text-xs px-3 py-1.5">
                + 請求書作成
              </Link>
            </div>
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">この顧客宛の請求書はまだありません</div>
            ) : (
              <DocTable docs={invoices} />
            )}
          </Card>

          <Card padding="none">
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Estimates</div>
                <div className="mt-1 text-base font-semibold text-primary">見積書 ({estimates.length}件)</div>
              </div>
            </div>
            {estimates.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">見積書はありません</div>
            ) : (
              <DocTable docs={estimates} />
            )}
          </Card>

          {otherDocs.length > 0 && (
            <Card padding="none">
              <div className="border-b border-border-subtle p-5">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Other Documents</div>
                <div className="mt-1 text-base font-semibold text-primary">その他書類 ({otherDocs.length}件)</div>
              </div>
              <DocTable docs={otherDocs} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function DocTable({ docs }: { docs: Document[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-hover">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">番号</th>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">種類</th>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">発行日</th>
            <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">期限</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {docs.map((d) => (
            <tr key={d.id} className="hover:bg-surface-hover/60">
              <td className="px-5 py-3.5">
                <Link href={`/admin/invoices/${d.id}`} className="font-mono text-accent underline hover:text-accent">
                  {d.doc_number ?? d.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-secondary">{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</td>
              <td className="px-5 py-3.5">
                <Badge variant={docStatusVariant(d.status)}>{DOC_STATUS_LABEL[d.status] ?? d.status}</Badge>
              </td>
              <td className="px-5 py-3.5 font-medium text-primary">{formatJpy(d.total)}</td>
              <td className="px-5 py-3.5 whitespace-nowrap text-secondary">{formatDate(d.issued_at)}</td>
              <td className="px-5 py-3.5 whitespace-nowrap text-secondary">{formatDate(d.due_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
