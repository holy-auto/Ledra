"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";

/**
 * CustomerTabs
 * ------------------------------------------------------------
 * 顧客詳細画面の 360° ビュー。
 * 顧客基本情報カードの下に配置され、タブ切替で
 * 車両 / 証明書 / 予約 / 請求 を横断表示する。
 */

export type VehicleItem = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
};

export type CertificateItem = {
  public_id: string;
  status: string;
  customer_name: string | null;
  created_at: string;
  service_price: number | null;
};

export type ReservationItem = {
  id: string;
  title: string | null;
  status: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  estimated_amount: number | null;
};

export type InvoiceItem = {
  id: string;
  doc_number: string | null;
  status: string;
  total: number | null;
  issued_at: string | null;
  due_date: string | null;
};

type TabKey = "vehicles" | "certificates" | "reservations" | "billing";

interface Props {
  customerId: string;
  vehicles: VehicleItem[];
  certificates: CertificateItem[];
  reservations: ReservationItem[];
  invoices: InvoiceItem[];
}

const certStatusVariant = (s: string) => {
  switch (s) {
    case "active":
      return "success" as const;
    case "void":
      return "danger" as const;
    default:
      return "default" as const;
  }
};

const invoiceStatusVariant = (s: string) => {
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

const invoiceStatusLabel = (s: string) => {
  switch (s) {
    case "draft":
      return "下書き";
    case "sent":
      return "送付済";
    case "paid":
      return "入金済";
    case "overdue":
      return "期限超過";
    case "cancelled":
      return "キャンセル";
    default:
      return s;
  }
};

const reservationStatusVariant = (s: string) => {
  switch (s) {
    case "completed":
      return "success" as const;
    case "cancelled":
      return "danger" as const;
    case "in_progress":
      return "info" as const;
    case "arrived":
      return "warning" as const;
    default:
      return "default" as const;
  }
};

const reservationStatusLabel = (s: string) => {
  switch (s) {
    case "confirmed":
      return "予約確定";
    case "arrived":
      return "来店・受付";
    case "in_progress":
      return "作業中";
    case "completed":
      return "完了";
    case "cancelled":
      return "キャンセル";
    default:
      return s;
  }
};

export default function CustomerTabs({
  customerId,
  vehicles,
  certificates,
  reservations,
  invoices,
}: Props) {
  const [tab, setTab] = useState<TabKey>("vehicles");

  const tabs = useMemo(
    () =>
      [
        { k: "vehicles" as const, label: `車両 (${vehicles.length})` },
        { k: "certificates" as const, label: `証明書 (${certificates.length})` },
        { k: "reservations" as const, label: `予約・案件 (${reservations.length})` },
        { k: "billing" as const, label: `請求 (${invoices.length})` },
      ],
    [vehicles.length, certificates.length, reservations.length, invoices.length],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border-subtle overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.k
                ? "border-accent text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vehicles" && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">
                VEHICLES
              </div>
              <div className="mt-1 text-base font-semibold text-primary">
                紐付き車両 ({vehicles.length}件)
              </div>
            </div>
            <Link
              href={`/admin/vehicles/new?returnTo=/admin/customers/${customerId}`}
              className="btn-secondary text-xs"
            >
              + 車両登録
            </Link>
          </div>
          <div className="divide-y divide-border-subtle">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover/60"
              >
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/vehicles/${v.id}`}
                    className="font-medium text-primary hover:text-accent"
                  >
                    {v.maker} {v.model}
                  </Link>
                  {v.year && (
                    <span className="text-xs text-muted">{v.year}年</span>
                  )}
                  {v.plate_display && (
                    <span className="text-xs text-secondary">
                      {v.plate_display}
                    </span>
                  )}
                </div>
                <Link
                  href={`/admin/certificates/new?vehicle_id=${v.id}&customer_id=${customerId}`}
                  className="btn-primary text-xs py-1 px-3"
                >
                  証明書発行
                </Link>
              </div>
            ))}
            {vehicles.length === 0 && (
              <div className="px-5 py-8 text-center text-muted text-sm">
                紐付き車両はありません
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "certificates" && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">
                CERTIFICATES
              </div>
              <div className="mt-1 text-base font-semibold text-primary">
                紐付き証明書 ({certificates.length}件)
              </div>
            </div>
            <Link
              href={`/admin/certificates/new?customer_id=${customerId}`}
              className="btn-primary text-xs px-3 py-1.5"
            >
              + 新規発行
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    証明書ID
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    顧客名
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    ステータス
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    施工料金
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    発行日
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {certificates.map((cert) => (
                  <tr
                    key={cert.public_id}
                    className="hover:bg-surface-hover/60"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/certificates/${cert.public_id}`}
                        className="font-mono text-accent hover:text-accent underline"
                      >
                        {cert.public_id}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-secondary">
                      {cert.customer_name ?? "-"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={certStatusVariant(cert.status)}>
                        {cert.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-secondary">
                      {cert.service_price != null
                        ? formatJpy(cert.service_price)
                        : "-"}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                      {formatDate(cert.created_at)}
                    </td>
                  </tr>
                ))}
                {certificates.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-muted"
                    >
                      紐付き証明書はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "reservations" && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">
                RESERVATIONS
              </div>
              <div className="mt-1 text-base font-semibold text-primary">
                予約・案件 ({reservations.length}件)
              </div>
            </div>
            <Link
              href={`/admin/jobs/new?customer_id=${customerId}`}
              className="btn-secondary text-xs"
            >
              🏃 飛び込み案件
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    タイトル
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    予約日
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    時間
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    ステータス
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    概算金額
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-hover/60">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/jobs/${r.id}`}
                        className="text-accent underline hover:text-accent"
                      >
                        {r.title ?? "(無題)"}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                      {formatDate(r.scheduled_date)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                      {r.start_time ?? "-"}
                      {r.end_time ? ` 〜 ${r.end_time}` : ""}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={reservationStatusVariant(r.status)}>
                        {reservationStatusLabel(r.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-secondary">
                      {r.estimated_amount != null
                        ? formatJpy(r.estimated_amount)
                        : "-"}
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-muted"
                    >
                      予約・案件の履歴はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "billing" && (
        <section className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">
                INVOICES
              </div>
              <div className="mt-1 text-base font-semibold text-primary">
                紐付き請求書 ({invoices.length}件)
              </div>
            </div>
            <Link
              href={`/admin/invoices/new?customer_id=${customerId}`}
              className="btn-primary text-xs px-3 py-1.5"
            >
              + 請求書作成
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    請求番号
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    ステータス
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    合計
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    発行日
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                    支払期限
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-hover/60">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="font-mono text-accent hover:text-accent underline"
                      >
                        {inv.doc_number ?? inv.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={invoiceStatusVariant(inv.status)}>
                        {invoiceStatusLabel(inv.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-primary">
                      {inv.total != null ? formatJpy(inv.total) : "-"}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                      {formatDate(inv.issued_at)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                      {formatDate(inv.due_date)}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-muted"
                    >
                      紐付き請求書はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
