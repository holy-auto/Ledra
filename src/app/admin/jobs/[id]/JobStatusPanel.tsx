"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import {
  STATUS_FLOW,
  STATUS_LABEL,
  STATUS_HINT,
  type JobReservation,
} from "./types";

/**
 * JobStatusPanel
 * ------------------------------------------------------------
 * 案件ワークフロー画面の「上部エリア」: ステータスステッパー +
 * 次アクションパネル。reservation/customer/vehicle の軽量データだけで
 * 即座に描画できるため Suspense の外側に配置する。
 */

interface Props {
  reservation: JobReservation;
  customerId: string | null;
  vehicleId: string | null;
}

export default function JobStatusPanel({
  reservation,
  customerId,
  vehicleId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const currentStatus = reservation.status;
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUS_FLOW.indexOf(
    currentStatus as (typeof STATUS_FLOW)[number],
  );
  const nextStatus =
    currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1
      ? STATUS_FLOW[currentIndex + 1]
      : null;

  async function advanceStatus(target: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reservation.id, status: target }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
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
    if (vehicleId) params.set("vehicle_id", vehicleId);
    if (customerId) params.set("customer_id", customerId);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  const invoiceNewUrl = customerId
    ? `/admin/invoices/new?customer_id=${customerId}`
    : `/admin/invoices/new`;

  return (
    <div className="space-y-6">
      <Card padding="default">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              Status
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  isCancelled
                    ? "danger"
                    : currentStatus === "completed"
                      ? "success"
                      : "info"
                }
              >
                {STATUS_LABEL[currentStatus] ?? currentStatus}
              </Badge>
              <span className="text-[13px] text-secondary">
                {STATUS_HINT[currentStatus] ?? ""}
              </span>
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

        <ol className="mt-5 flex items-center gap-2 overflow-x-auto">
          {STATUS_FLOW.map((s, i) => {
            const active = !isCancelled && i === currentIndex;
            const done = !isCancelled && i < currentIndex;
            return (
              <li
                key={s}
                className="flex items-center gap-2 whitespace-nowrap"
              >
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
                {i < STATUS_FLOW.length - 1 && (
                  <span className="text-muted">→</span>
                )}
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

      <Card padding="default">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase mb-3">
          Next Actions
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={certificateNewUrl}
            className="btn-primary text-sm px-4 py-2"
          >
            🪪 証明書を発行
          </Link>
          <Link href={invoiceNewUrl} className="btn-secondary text-sm px-4 py-2">
            💰 請求書を作成
          </Link>
          {customerId && (
            <Link
              href={`/admin/customers/${customerId}`}
              className="btn-secondary text-sm px-4 py-2"
            >
              👤 顧客詳細
            </Link>
          )}
          {vehicleId && (
            <Link
              href={`/admin/vehicles/${vehicleId}`}
              className="btn-secondary text-sm px-4 py-2"
            >
              🚗 車両詳細
            </Link>
          )}
          <Link
            href={`/admin/reservations?focus=${reservation.id}`}
            className="btn-secondary text-sm px-4 py-2"
          >
            📅 予約画面で編集
          </Link>
        </div>
      </Card>
    </div>
  );
}
