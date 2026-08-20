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
import { computeStepGuideState } from "@/lib/workflow/stepChecklist";
import StepGuidePanel from "@/components/workflow/StepGuidePanel";
import { STATUS_FLOW, STATUS_LABEL, STATUS_HINT, type JobReservation, type WorkflowStep } from "./types";
import { reservationStatusDisplay } from "@/lib/domain/jobStatusDisplay";

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
  /** テンプレートの工程一覧 (workflow_template_id が設定されている場合のみ)。 */
  workflowSteps?: WorkflowStep[] | null;
}

export default function JobStatusPanel({ reservation, customerId, vehicleId, workflowSteps }: Props) {
  const router = useRouter();
  const { mode, hydrated } = useViewMode();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assigneeBusy, setAssigneeBusy] = useState(false);
  const [partsBusy, setPartsBusy] = useState(false);
  // 現場ガイド（写真ガイド／確認チェックリスト）: 作業者がチェック済みの項目と、
  // 未確認のまま進めようとしたときのソフト警告状態。工程が変わるとリセットする。
  // Hook は storefront 早期 return より前に置く (rules-of-hooks)。
  const [confirmedPhotos, setConfirmedPhotos] = useState<string[]>([]);
  const [confirmedChecks, setConfirmedChecks] = useState<string[]>([]);
  const [pendingWarn, setPendingWarn] = useState(false);
  const [prevStepOrder, setPrevStepOrder] = useState(reservation.current_step_order ?? 0);

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

  // テンプレート駆動ワークフロー (workflow_template_id 設定済み) か、レガシー4ステップかを出し分け。
  // どちらも POST .../advance で進行する (advance API 側がテンプレート有無を吸収する)。
  const hasTemplate = !!reservation.workflow_template_id && !!workflowSteps && workflowSteps.length > 0;
  const currentStepOrder = reservation.current_step_order ?? 0;
  const nextTemplateStep = hasTemplate ? (workflowSteps!.find((s) => s.order === currentStepOrder + 1) ?? null) : null;

  // 現在進行中の工程のガイド状態（写真ガイド／確認チェックリスト）。判定は純関数に集約。
  // 工程が変わったらチェック状態・警告をレンダー中にリセット（React 推奨の派生状態リセット）。
  const currentStep = hasTemplate ? (workflowSteps!.find((s) => s.order === currentStepOrder) ?? null) : null;
  if (prevStepOrder !== currentStepOrder) {
    setPrevStepOrder(currentStepOrder);
    setConfirmedPhotos([]);
    setConfirmedChecks([]);
    setPendingWarn(false);
  }
  const guide = currentStep
    ? computeStepGuideState(currentStep, { photos: confirmedPhotos, checks: confirmedChecks })
    : null;
  const togglePhoto = (label: string) => {
    setPendingWarn(false);
    setConfirmedPhotos((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  };
  const toggleCheck = (label: string) => {
    setPendingWarn(false);
    setConfirmedChecks((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  };

  const currentIndex = STATUS_FLOW.indexOf(currentStatus as (typeof STATUS_FLOW)[number]);
  const legacyNextStatus =
    currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null;

  // advance() 自体が status==="completed"/"cancelled" を弾く唯一の判定源。テンプレート駆動時に
  // currentStepOrder と手元の workflowSteps.length を突き合わせると、最終工程に乗った直後
  // (currentStepOrder === totalSteps, まだ in_progress) でボタンが消えて完了操作ができなくなる
  // ため、ここでは currentStatus だけを見る (レガシーフローと判定基準を揃える)。
  const canAdvance = !isCancelled && currentStatus !== "completed" && (hasTemplate || legacyNextStatus != null);
  const nextLabel = hasTemplate
    ? (nextTemplateStep?.label ?? "完了")
    : legacyNextStatus
      ? STATUS_LABEL[legacyNextStatus]
      : null;

  /** 案件ワークフローを次の工程へ1タップ進行する (ジョブ詳細・メカニック稼働管理で共通の確認ボタン)。 */
  async function advance() {
    setBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: `/api/admin/reservations/${reservation.id}/advance`,
        method: "POST",
        body: {},
        label: `案件を次の工程へ${nextLabel ? ` (${nextLabel})` : ""}`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。進行を保留し、ネット復帰後に自動同期します。`);
        return;
      }
      if (!r.ok && r.response) {
        const j = await parseJsonSafe(r.response);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** 進行の入口。未確認のガイド項目があれば一度だけソフト警告を出し、次のタップで進める。
   *  思想「強制停止は最小限」に従いブロックしない（もう一度押せば必ず進める）。 */
  function attemptAdvance() {
    if (guide && guide.outstanding > 0 && !pendingWarn) {
      setPendingWarn(true);
      return;
    }
    void advance();
  }

  /** 部品交換ありトグル。ON にするとバックエンドが装着記録 (draft) を自動作成する (新規UIは無し)。 */
  async function togglePartsReplacement(next: boolean) {
    setPartsBusy(true);
    setErr(null);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/reservations",
        method: "PUT",
        body: { id: reservation.id, parts_replacement: next },
        label: `部品交換あり: ${next ? "ON" : "OFF"} (${reservation.title ?? "案件"})`,
        kind: "reservation_update",
      });
      if (r.queued) {
        setErr(`📡 オフラインです。変更を保留し、ネット復帰後に自動同期します。`);
        return;
      }
      if (!r.ok && r.response) {
        const j = await parseJsonSafe(r.response);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPartsBusy(false);
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
        throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
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
        throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
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
        throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
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
    // この案件の予約 ID を渡し、証明書発行時に正しい施工担当（職人）を刻めるようにする。
    params.set("reservation_id", reservation.id);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  })();

  // 作業内容によっては完了後に証跡を残しづらいことがあるため、作業中のうちに
  // 撮影を促す（下書き保存すれば後で続きを入力・発行できる）。
  const inProgressPhotoUrl = `${certificateNewUrl}&stage=in_progress`;

  // 案件 (reservation) ID を含めて遷移すると DocumentForm が
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

  // AI 担当提案 (mechanic.auto_assign_suggest)。未割当のときだけ「1タップで割当」候補を出す。
  // 割当の確定は人 (このボタン) が行う — 自動割当はしない。提案は入庫時スナップショットなので、
  // その後に退職/非稼働化した職人 (staffList = 在籍者に不在) は候補から除外する。
  const aiSuggested = !reservation.assigned_staff_id
    ? (reservation.ai_assignee_suggestion?.candidates?.[0] ?? null)
    : null;
  const aiTopCandidate = aiSuggested && staffList.some((s) => s.id === aiSuggested.staff_id) ? aiSuggested : null;

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
              <Badge variant={reservationStatusDisplay(currentStatus).variant}>
                {STATUS_LABEL[currentStatus] ?? currentStatus}
              </Badge>
              <span className="text-[13px] text-secondary">
                {hasTemplate
                  ? (workflowSteps!.find((s) => s.order === currentStepOrder)?.label ?? STATUS_HINT[currentStatus])
                  : (STATUS_HINT[currentStatus] ?? "")}
              </span>
            </div>
          </div>
          {canAdvance && (
            <MutationGuard>
              <button
                onClick={attemptAdvance}
                disabled={busy}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              >
                {busy
                  ? "更新中..."
                  : pendingWarn && guide && guide.outstanding > 0
                    ? "このまま進める →"
                    : `確認: ${nextLabel} へ進む →`}
              </button>
            </MutationGuard>
          )}
        </div>

        {/* 現場ガイド: この工程で撮る写真・確認する項目（撮り忘れ／確認漏れ防止） */}
        {!isCancelled && currentStatus !== "completed" && (
          <StepGuidePanel
            guide={guide}
            onTogglePhoto={togglePhoto}
            onToggleCheck={toggleCheck}
            pendingWarn={pendingWarn}
            className="mt-4 rounded-xl border border-border-subtle bg-inset p-3 space-y-2.5"
          />
        )}

        {/* 作業中の撮影を促す: 完了後だと証跡を残しづらい作業もあるため、途中でも撮影導線を出す */}
        {currentStatus === "in_progress" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/20 bg-accent-dim px-3 py-2.5">
            <span className="text-xs text-accent-text">
              📷 完了後は証跡を残しづらい作業もあります。作業中の様子も撮っておくと安心です。
            </span>
            <Link href={inProgressPhotoUrl} className="btn-secondary text-xs px-3 py-1.5 ml-auto whitespace-nowrap">
              作業中の写真を撮る
            </Link>
          </div>
        )}

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
            <MutationGuard>
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
            </MutationGuard>
            {staffBusy && <span className="text-muted">更新中…</span>}
            {jobSkillTags.length > 0 && (
              <span className="text-[10px] text-muted">★=スキル一致（{jobSkillTags.join("・")}）</span>
            )}
            {/* AI 担当提案: 未割当のとき最有力候補を1タップで割り当てる (確定は人)。 */}
            {aiTopCandidate && (
              <MutationGuard>
                <button
                  type="button"
                  onClick={() => changeAssignedStaff(aiTopCandidate.staff_id)}
                  disabled={staffBusy || isCancelled}
                  title={aiTopCandidate.reason}
                  className="rounded-full border border-accent/40 bg-accent-dim px-2.5 py-1 text-[11px] font-medium text-accent-text transition-colors hover:border-accent disabled:opacity-50"
                >
                  🤖 AI提案: {aiTopCandidate.staff_name} を割当
                </button>
              </MutationGuard>
            )}
          </div>

          {/* ブース（ピット）ピッカー */}
          {(boothList.length > 0 || currentBooth) && (
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-[0.12em] text-muted uppercase">ブース</span>
              {currentBooth ? (
                <span className="text-primary">{currentBooth.name}</span>
              ) : (
                <span className="text-muted">未割当</span>
              )}
              <MutationGuard>
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
              </MutationGuard>
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

          {/* 部品交換あり: ON にするとバックエンドが装着記録 (draft) を自動作成する。 */}
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-[0.12em] text-muted uppercase">部品交換</span>
            <MutationGuard>
              <button
                type="button"
                onClick={() => togglePartsReplacement(!reservation.parts_replacement)}
                disabled={partsBusy || isCancelled}
                aria-pressed={!!reservation.parts_replacement}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  reservation.parts_replacement
                    ? "border-accent-amber/40 bg-accent-amber-dim text-accent-amber-text"
                    : "border-border-strong text-muted hover:text-primary"
                }`}
              >
                部品交換あり {reservation.parts_replacement ? "ON" : "OFF"}
              </button>
            </MutationGuard>
            {partsBusy && <span className="text-muted">更新中…</span>}
          </div>
        </div>

        {/* ponytail: IMP-022 情報階層 — 現ステップを視覚的に最大化し、完了・未着手を圧縮。 */}
        <ol className="mt-5 flex items-center gap-1.5 overflow-x-auto">
          {(hasTemplate
            ? workflowSteps!.map((s) => ({ key: s.key, label: s.label, order: s.order }))
            : STATUS_FLOW.map((s, i) => ({ key: s, label: STATUS_LABEL[s], order: i }))
          ).map((s, i) => {
            const active = hasTemplate
              ? !isCancelled && s.order === currentStepOrder
              : !isCancelled && i === currentIndex;
            const done = hasTemplate ? !isCancelled && s.order < currentStepOrder : !isCancelled && i < currentIndex;
            const total = hasTemplate ? workflowSteps!.length : STATUS_FLOW.length;
            return (
              <li key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <div
                  className={`flex items-center rounded-full border font-medium ${
                    active
                      ? "gap-2 border-2 border-accent bg-accent-dim text-accent-text px-3.5 py-1.5 text-sm"
                      : done
                        ? "gap-1.5 border-success/20 bg-success-dim text-success-text px-2.5 py-0.5 text-[11px]"
                        : "gap-1.5 border-border-default bg-inset text-secondary px-2.5 py-0.5 text-[11px]"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center rounded-full bg-surface/60 font-bold ${
                      active ? "h-5 w-5 text-[11px]" : "h-4 w-4 text-[10px]"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {s.label}
                </div>
                {i < total - 1 && <span className="text-muted text-[10px]">→</span>}
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

      {/* ponytail: IMP-022 CTA 規律 — ステータスに応じた文脈的アクションのみ表示。 */}
      {!isCancelled && (
        <Card padding="default">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase mb-3">Next Actions</div>
          <div className="flex flex-wrap gap-2">
            {(currentStatus === "in_progress" || currentStatus === "completed") && (
              <Link
                href={certificateNewUrl}
                className={`${currentStatus === "completed" ? "btn-primary" : "btn-secondary"} text-sm px-4 py-2`}
              >
                🪪 証明書を発行
              </Link>
            )}
            {currentStatus === "completed" && (
              <Link href={invoiceNewUrl} className="btn-secondary text-sm px-4 py-2">
                💰 請求書を作成
              </Link>
            )}
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
            {currentStatus !== "completed" && (
              <Link href={`/admin/reservations?focus=${reservation.id}`} className="btn-secondary text-sm px-4 py-2">
                📅 予約画面で編集
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
