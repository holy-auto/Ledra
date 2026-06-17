"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MutationGuard from "@/components/ui/MutationGuard";
import { useViewMode } from "@/lib/view-mode/ViewModeContext";
import { fetcher } from "@/lib/swr";
import { computeWorkDurationText } from "@/lib/admin/work-duration";
import { enqueueOrFetch } from "@/lib/outbox/enqueueOrFetch";
import { inferJobSkillTags, skillMatchScore, SERVICE_TYPES } from "@/lib/staff/skills";
import { STATUS_FLOW, STATUS_LABEL, STATUS_HINT, type JobReservation } from "./types";

type MemberRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
};
type MembersResponse = { members: MemberRow[] };

type StaffRow = {
  id: string;
  name: string;
  kind: "internal" | "external";
  skills: string[];
  is_active: boolean;
};
type StaffResponse = { staff: StaffRow[] };

type BoothRow = {
  id: string;
  name: string;
  booth_type: string | null;
  is_active: boolean;
};
type BoothsResponse = { booths: BoothRow[] };

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

  // 施工担当（職人）ピッカー用。PII を含まない最小ピッカー API を使う（roster は members:view）。
  const { data: staffData } = useSWR<StaffResponse>("/api/admin/staff/picker", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const allStaff = staffData?.staff ?? [];
  const staffList = allStaff.filter((s) => s.is_active); // 選択候補は在籍者のみ
  const [staffBusy, setStaffBusy] = useState(false);

  // ブース（ピット）ピッカー用。
  const { data: boothsData } = useSWR<BoothsResponse>("/api/admin/booths", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const allBooths = boothsData?.booths ?? [];
  const boothList = allBooths.filter((b) => b.is_active); // 選択候補は稼働中のみ
  const [boothBusy, setBoothBusy] = useState(false);

  // 案件テキスト（タイトル + メニュー名）から必要スキルを推定し、担当候補とマッチングする。
  // menu_items_json は z.any() で配列保証が無いため Array.isArray でガードする（非配列で .map クラッシュ防止）。
  const menuNames = Array.isArray(reservation.menu_items_json)
    ? reservation.menu_items_json.map((m) => m?.name).filter(Boolean)
    : [];
  const jobSkillTags = inferJobSkillTags([reservation.title ?? "", ...menuNames].join(" "));

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

  async function changeAssignedStaff(newStaffId: string | null) {
    setStaffBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/reservations",
        method: "PUT",
        body: { id: reservation.id, assigned_staff_id: newStaffId },
        label: `施工担当変更 (${reservation.title ?? "案件"})`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。担当変更を保留し、ネット復帰後に自動同期します。`);
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
      setStaffBusy(false);
    }
  }

  async function changeBooth(newBoothId: string | null) {
    setBoothBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/reservations",
        method: "PUT",
        body: { id: reservation.id, booth_id: newBoothId },
        label: `ブース変更 (${reservation.title ?? "案件"})`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。ブース変更を保留し、ネット復帰後に自動同期します。`);
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
      setBoothBusy(false);
    }
  }

  const certificateNewUrl = (() => {
    const params = new URLSearchParams();
    if (vehicleId) params.set("vehicle_id", vehicleId);
    if (customerId) params.set("customer_id", customerId);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  // 案件 (reservation) ID を含めて遷移すると InvoicesClient が
  // ai-from-job を叩いて明細・備考を AI 起票する。
  const invoiceNewUrl = (() => {
    const params = new URLSearchParams();
    params.set("reservation_id", reservation.id);
    if (customerId) params.set("customer_id", customerId);
    return `/admin/invoices/new?${params.toString()}`;
  })();

  // tick を依存させて再計算をトリガする (in_progress 時のライブ更新)
  void tick;
  const workDurationText = computeWorkDurationText({
    workStartedAt: reservation.work_started_at,
    workCompletedAt: reservation.work_completed_at,
    isInProgress: currentStatus === "in_progress",
  });

  const currentAssignee = members.find((m) => m.user_id === reservation.assigned_user_id) ?? null;
  // 担当者は休止後も表示できるよう全件から解決（選択候補だけ在籍者に絞る）
  const currentStaff = allStaff.find((s) => s.id === reservation.assigned_staff_id) ?? null;

  // 担当候補をスキルマッチ順に並べる（マッチ多い順 → 名前順）
  const sortedStaff = [...staffList].sort((a, b) => {
    const diff = skillMatchScore(b.skills, jobSkillTags) - skillMatchScore(a.skills, jobSkillTags);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const currentBooth = allBooths.find((b) => b.id === reservation.booth_id) ?? null;
  // ブース区分が案件内容に合うものを優先表示（キー + 日本語ラベルの両方でマッチ判定）
  const boothMatch = (b: BoothRow) => {
    if (!b.booth_type) return 0;
    const label = SERVICE_TYPES.find((s) => s.key === b.booth_type)?.label ?? b.booth_type;
    return skillMatchScore([b.booth_type, label], jobSkillTags);
  };
  const sortedBooths = [...boothList].sort((a, b) => boothMatch(b) - boothMatch(a) || a.name.localeCompare(b.name));

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
            <MutationGuard>
              <button
                onClick={() => advanceStatus(nextStatus)}
                disabled={busy}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              >
                {busy ? "更新中..." : `${STATUS_LABEL[nextStatus]} へ進む →`}
              </button>
            </MutationGuard>
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
            <MutationGuard>
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
            </MutationGuard>
            {assigneeBusy && <span className="text-muted">更新中…</span>}
          </div>

          {/* 施工担当（職人）ピッカー — 社内/外注を含む staff_members。スキルマッチ順。 */}
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-[0.12em] text-muted uppercase">施工担当</span>
            {currentStaff ? (
              <span className="text-primary">
                {currentStaff.name}
                {currentStaff.kind === "external" && <span className="ml-1 text-[10px] text-warning">外注</span>}
              </span>
            ) : (
              <span className="text-muted">未割当</span>
            )}
            <select
              aria-label="施工担当を変更"
              className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary disabled:opacity-50"
              value={reservation.assigned_staff_id ?? ""}
              disabled={staffBusy || isCancelled}
              onChange={(e) => changeAssignedStaff(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">— 未割当 —</option>
              {sortedStaff.map((s) => {
                const match = skillMatchScore(s.skills, jobSkillTags) > 0;
                return (
                  <option key={s.id} value={s.id}>
                    {match ? "★ " : ""}
                    {s.name}
                    {s.kind === "external" ? "（外注）" : ""}
                    {s.skills.length ? ` — ${s.skills.join("/")}` : ""}
                  </option>
                );
              })}
            </select>
            {staffBusy && <span className="text-muted">更新中…</span>}
            {jobSkillTags.length > 0 && (
              <span className="text-[10px] text-muted">★=スキル一致（{jobSkillTags.join("・")}）</span>
            )}
          </div>

          {/* ブース（ピット）ピッカー */}
          {boothList.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-[0.12em] text-muted uppercase">ブース</span>
              {currentBooth ? (
                <span className="text-primary">{currentBooth.name}</span>
              ) : (
                <span className="text-muted">未割当</span>
              )}
              <select
                aria-label="ブースを変更"
                className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-primary disabled:opacity-50"
                value={reservation.booth_id ?? ""}
                disabled={boothBusy || isCancelled}
                onChange={(e) => changeBooth(e.target.value === "" ? null : e.target.value)}
              >
                <option value="">— 未割当 —</option>
                {sortedBooths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {boothMatch(b) > 0 ? "★ " : ""}
                    {b.name}
                  </option>
                ))}
              </select>
              {boothBusy && <span className="text-muted">更新中…</span>}
            </div>
          )}

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
