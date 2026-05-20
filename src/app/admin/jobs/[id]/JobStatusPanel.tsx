"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useViewMode } from "@/lib/view-mode/ViewModeContext";
import { fetcher } from "@/lib/swr";
import { computeWorkDurationText } from "@/lib/admin/work-duration";
import { enqueueOrFetch } from "@/lib/outbox/enqueueOrFetch";
import { STATUS_FLOW, STATUS_LABEL, STATUS_HINT, type JobReservation } from "./types";

type MemberRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};
type MembersResponse = { members: MemberRow[] };

/**
 * JobStatusPanel
 * ------------------------------------------------------------
 * 案件ワークフロー画面の「上部エリア」: ステータスステッパー +
 * 次アクションパネル。reservation/customer/vehicle の軽量データだけで
 * 即座に描画できるため Suspense の外側に配置する。
 *
 * 店頭 (storefront) モードでは <StorefrontJobWorkflow> が独自の大型ボタン式
 * ステータスパネルを持つため、本コンポーネントは非表示となる。
 */

interface Props {
  reservation: JobReservation;
  customerId: string | null;
  vehicleId: string | null;
}

export default function JobStatusPanel({ reservation, customerId, vehicleId }: Props) {
  const router = useRouter();
  const { mode, hydrated } = useViewMode();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assigneeBusy, setAssigneeBusy] = useState(false);

  const currentStatus = reservation.status;

  // メンバー一覧 (担当者ピッカー用)。リスト UI を開かないと無駄なので focus 時に遅延取得。
  // 早期 return の前にすべての Hook を呼ぶ (rules-of-hooks)。
  const { data: membersData } = useSWR<MembersResponse>("/api/admin/members", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const members = membersData?.members ?? [];

  // 作業タイマー: in_progress 中はライブ更新 (60 秒間隔)、完了済みは静的表示
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (currentStatus !== "in_progress" || !reservation.work_started_at) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [currentStatus, reservation.work_started_at]);

  // 店頭モードでは StorefrontJobWorkflow が独自ステータス UI を持つため描画しない
  if (hydrated && mode === "storefront") {
    return null;
  }

  // currentStatus は早期 return 後の本体描画で使用
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUS_FLOW.indexOf(currentStatus as (typeof STATUS_FLOW)[number]);
  const nextStatus = currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null;

  async function advanceStatus(target: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/reservations",
        method: "PUT",
        body: { id: reservation.id, status: target },
        label: `案件ステータス → ${STATUS_LABEL[target] ?? target}`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。ステータス変更を保留し、ネット復帰後に自動同期します。`);
        return;
      }
      if (!r.ok && r.response) {
        const j = await parseJsonSafe(r.response);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeAssignee(newUserId: string | null) {
    setAssigneeBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/reservations",
        method: "PUT",
        body: { id: reservation.id, assigned_user_id: newUserId },
        label: `担当者変更 (${reservation.title ?? "案件"})`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。担当者変更を保留し、ネット復帰後に自動同期します。`);
        return;
      }
      if (!r.ok && r.response) {
        const j = await parseJsonSafe(r.response);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigneeBusy(false);
    }
  }

  const certificateNewUrl = (() => {
    const params = new URLSearchParams();
    if (vehicleId) params.set("vehicle_id", vehicleId);
    if (customerId) params.set("customer_id", customerId);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  const invoiceNewUrl = customerId ? `/admin/invoices/new?customer_id=${customerId}` : `/admin/invoices/new`;

  // tick を依存させて再計算をトリガする (in_progress 時のライブ更新)
  void tick;
  const workDurationText = computeWorkDurationText({
    workStartedAt: reservation.work_started_at,
    workCompletedAt: reservation.work_completed_at,
    isInProgress: currentStatus === "in_progress",
  });

  const currentAssignee = members.find((m) => m.user_id === reservation.assigned_user_id) ?? null;

  return (
    <div className="space-y-6">
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

        {/* 担当者ピッカー + 作業タイマー */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-[0.12em] text-muted uppercase">担当</span>
            {currentAssignee ? (
              <span className="text-primary">
                {currentAssignee.display_name ?? currentAssignee.email ?? "(no email)"}
              </span>
            ) : (
              <span className="text-muted">未割当</span>
            )}
            <select
              aria-label="担当者を変更"
              className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary disabled:opacity-50"
              value={reservation.assigned_user_id ?? ""}
              disabled={assigneeBusy || isCancelled}
              onChange={(e) => changeAssignee(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">— 未割当 —</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
            {assigneeBusy && <span className="text-muted">更新中…</span>}
          </div>

          {workDurationText && (
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-[0.12em] text-muted uppercase">作業時間</span>
              <span className={`tabular-nums ${currentStatus === "completed" ? "text-success-text" : "text-accent"}`}>
                {currentStatus === "in_progress" ? "⏱️ " : "✅ "}
                {workDurationText}
              </span>
              {currentStatus === "in_progress" && <span className="text-muted">(計測中)</span>}
            </div>
          )}
        </div>

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
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface/60 text-[11px] font-bold">
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

      <Card padding="default">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase mb-3">Next Actions</div>
        <div className="flex flex-wrap gap-2">
          <Link href={certificateNewUrl} className="btn-primary text-sm px-4 py-2">
            🪪 証明書を発行
          </Link>
          <Link href={invoiceNewUrl} className="btn-secondary text-sm px-4 py-2">
            💰 請求書を作成
          </Link>
          {customerId && (
            <Link href={`/admin/customers/${customerId}`} className="btn-secondary text-sm px-4 py-2">
              👤 顧客詳細
            </Link>
          )}
          {vehicleId && (
            <Link href={`/admin/vehicles/${vehicleId}`} className="btn-secondary text-sm px-4 py-2">
              🚗 車両詳細
            </Link>
          )}
          <Link href={`/admin/reservations?focus=${reservation.id}`} className="btn-secondary text-sm px-4 py-2">
            📅 予約画面で編集
          </Link>
        </div>
      </Card>
    </div>
  );
}
