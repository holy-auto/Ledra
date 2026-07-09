"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import MutationGuard from "@/components/ui/MutationGuard";
import { formatDate, formatJpy } from "@/lib/format";
import JobPackageApply from "./JobPackageApply";
import JobPhotosTab from "./JobPhotosTab";
import JobHandoffPanel from "./JobHandoffPanel";
import JobInspectionTab from "./JobInspectionTab";
import JobPartsTab from "./JobPartsTab";
import BillingSplitPanel from "@/components/admin/BillingSplitPanel";
import type {
  MenuItem,
  HandoffNote,
  JobReservation,
  JobCustomer,
  JobVehicle,
  JobCertificate,
  JobDocument,
} from "./types";

/**
 * JobDetailTabs
 * ------------------------------------------------------------
 * 案件ワークフロー画面の「下部エリア」: タブ切替 (サマリ / 顧客・車両 /
 * 証明書 / 請求・見積) とその内容。
 * certificates/documents の取得完了を待つため Suspense 境界内に配置。
 */

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

type TabKey =
  "summary" | "parties" | "certificates" | "photos" | "inspection" | "parts" | "billing" | "billing_split" | "handoff";

interface Props {
  reservation: JobReservation;
  customer: JobCustomer;
  vehicle: JobVehicle;
  certificates: JobCertificate[];
  documents: JobDocument[];
  /** 現在のログインユーザ id (申し送りの自己投稿判定用)。 */
  currentUserId?: string | null;
}

export default function JobDetailTabs({
  reservation,
  customer,
  vehicle,
  certificates,
  documents,
  currentUserId = null,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  const menuItems: MenuItem[] = Array.isArray(reservation.menu_items_json) ? reservation.menu_items_json : [];

  const handoffNotes: HandoffNote[] = Array.isArray(reservation.handoff_notes) ? reservation.handoff_notes : [];
  // important / urgent な申し送り件数 (タブバッジ表示用)。
  const handoffAlertCount = handoffNotes.filter((n) => n.priority === "important" || n.priority === "urgent").length;

  const invoices = useMemo(
    () => documents.filter((d) => ["invoice", "consolidated_invoice"].includes(d.doc_type)),
    [documents],
  );
  const estimates = useMemo(() => documents.filter((d) => d.doc_type === "estimate"), [documents]);
  const otherDocs = useMemo(
    () => documents.filter((d) => !["invoice", "consolidated_invoice", "estimate"].includes(d.doc_type)),
    [documents],
  );

  const certificateNewUrl = (() => {
    const params = new URLSearchParams();
    if (reservation.vehicle_id) params.set("vehicle_id", reservation.vehicle_id);
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  // reservation_id を含めると DocumentForm が ai-from-job で明細・備考を起票する
  const invoiceNewUrl = (() => {
    const params = new URLSearchParams();
    params.set("reservation_id", reservation.id);
    if (reservation.customer_id) params.set("customer_id", reservation.customer_id);
    return `/admin/invoices/new?${params.toString()}`;
  })();

  const tabItems: TabItem<TabKey>[] = [
    { key: "summary", label: "サマリ" },
    { key: "parties", label: "顧客・車両" },
    { key: "certificates", label: "証明書", count: certificates.length },
    { key: "photos", label: "📸 写真" },
    { key: "inspection", label: "点検" },
    { key: "parts", label: "部品" },
    { key: "billing", label: "請求・見積", count: invoices.length + estimates.length },
    // 按分タブは請求書 (invoice/consolidated_invoice) が存在する場合のみ表示。
    ...(invoices.length > 0 ? [{ key: "billing_split" as TabKey, label: "按分" }] : []),
    {
      key: "handoff",
      label: "申し送り",
      // important / urgent の申し送りは件数ではなくアラートなので赤バッジで強調。
      badge:
        handoffAlertCount > 0 ? (
          <span
            className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-[18px] text-white"
            style={{ backgroundColor: "var(--accent-red)" }}
          >
            {handoffAlertCount}
          </span>
        ) : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabItems} value={tab} onChange={setTab} ariaLabel="案件詳細タブ" />

      {tab === "photos" && <JobPhotosTab reservationId={reservation.id} certificateNewUrl={certificateNewUrl} />}

      {tab === "inspection" && (
        <JobInspectionTab
          reservationId={reservation.id}
          vehicleId={reservation.vehicle_id}
          customerId={reservation.customer_id}
        />
      )}

      {tab === "parts" && <JobPartsTab reservationId={reservation.id} />}

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
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                メニュー ({menuItems.length})
              </div>
              {reservation.status !== "cancelled" && (
                <MutationGuard>
                  <JobPackageApply
                    reservationId={reservation.id}
                    existingMenuItems={menuItems}
                    existingEstimate={reservation.estimated_amount}
                  />
                </MutationGuard>
              )}
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

      {tab === "certificates" && (
        <Card padding="none">
          <div className="flex items-center justify-between border-b border-border-subtle p-5">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Certificates</div>
              <div className="mt-1 text-base font-semibold text-primary">紐付き証明書 ({certificates.length}件)</div>
            </div>
            <MutationGuard>
              <Link href={certificateNewUrl} className="btn-primary text-xs px-3 py-1.5">
                + 新規発行
              </Link>
            </MutationGuard>
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

      {tab === "billing" && (
        <div className="space-y-4">
          <Card padding="none">
            <div className="flex items-center justify-between border-b border-border-subtle p-5">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Invoices</div>
                <div className="mt-1 text-base font-semibold text-primary">請求書 ({invoices.length}件)</div>
              </div>
              <MutationGuard>
                <Link href={invoiceNewUrl} className="btn-primary text-xs px-3 py-1.5">
                  + 請求書作成
                </Link>
              </MutationGuard>
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

      {tab === "billing_split" && (
        <div className="space-y-4">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">按分対象の請求書がありません。</div>
          ) : (
            invoices.map((d) => (
              <div key={d.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs text-muted">
                  <span className="font-mono text-secondary">{d.doc_number ?? d.id.slice(0, 8)}</span>
                  <span>{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</span>
                </div>
                <BillingSplitPanel documentId={d.id} documentTotal={d.total ?? 0} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === "handoff" && (
        <JobHandoffPanel reservationId={reservation.id} initialNotes={handoffNotes} currentUserId={currentUserId} />
      )}
    </div>
  );
}

function DocTable({ docs }: { docs: JobDocument[] }) {
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
