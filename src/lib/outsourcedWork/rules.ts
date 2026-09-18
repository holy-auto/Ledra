/**
 * 外注施工履歴 — 実行主体・権限マトリクス・復帰先制御（純粋関数）。
 *
 * 「何から何へ行けるか」は src/lib/domain/transitions.ts の OUTSOURCED_WORK_TRANSITIONS。
 * ここは「誰が起こせるか」（遷移表の実行主体列、権限マトリクス PER-001〜027）と
 * 「例外承認・保留解除のあとどこへ戻れるか」（PER-029 / AC-017 / AC-018）。
 * DB アクセスは持たない。呼び出し側（service.ts）が caller と作業依頼行を渡す。
 *
 * 仕様の6ロールは Ledra のテナントロール（owner/admin/staff/viewer）と
 * 「その作業依頼で自分のテナントが発注元か施工事業者か」から導く:
 *
 *   発注元テナント  owner/admin → client_admin（発注元管理者）
 *                   staff       → client_store_staff（発注元店舗担当者）
 *                   viewer      → viewer
 *   施工事業者      owner/admin → contractor_admin（施工会社管理者）
 *                   staff       → contractor_worker（施工担当者）
 *                   viewer      → viewer
 *
 * 「確認者」は発注元テナントのユーザーを作業依頼ごとに指名する（designated_reviewer_user_ids）。
 * 権限マトリクスの「設定時のみ」（PER-015/016 の施工会社管理者・確認者、PER-017〜019 の確認者）は
 * designated_approver_user_ids / designated_reviewer_user_ids に入っているかで判定する。
 */
import type { OutsourcedWorkState } from "@/lib/domain/states";
import { OUTSOURCED_WORK_TRANSITIONS, rejectTransition } from "@/lib/domain/transitions";
import type { Role } from "@/lib/auth/roles";

export const OUTSOURCED_ACTOR_ROLES = [
  "client_store_staff",
  "client_admin",
  "contractor_worker",
  "contractor_admin",
  "reviewer",
  "viewer",
] as const;
export type OutsourcedActorRole = (typeof OUTSOURCED_ACTOR_ROLES)[number];

/** 遷移表の実行主体「システム制御」。人は名乗れない（resolveActor が返さない）。 */
export type TransitionActor = OutsourcedActorRole | "system";

export type OutsourcedActor = {
  role: OutsourcedActorRole;
  /** PER-015/016「設定時のみ」: designated_approver_user_ids に入っている。 */
  designatedApprover: boolean;
  /** 発注元側か施工事業者側か（証跡閲覧範囲 PER-023 の判定に使う）。 */
  side: "client" | "contractor";
};

export type ActorResolutionInput = {
  userId: string;
  tenantId: string;
  role: Role;
  request: {
    client_tenant_id: string;
    contractor_tenant_id: string;
    designated_reviewer_user_ids: readonly string[] | null;
    designated_approver_user_ids: readonly string[] | null;
  };
};

/**
 * caller と作業依頼から、この依頼における実行主体を決める。
 * どちらのテナントにも属さなければ null（PER-028 テナント分離: 見せない・触らせない）。
 */
export function resolveActor(input: ActorResolutionInput): OutsourcedActor | null {
  const { request } = input;
  const isClient = input.tenantId === request.client_tenant_id;
  const isContractor = input.tenantId === request.contractor_tenant_id;
  if (!isClient && !isContractor) return null;
  // 自社発注・自社施工（両テナントが同じ）は依頼作成時に弾く。万一混入しても発注元側として扱う。
  const side = isClient ? "client" : "contractor";
  const designatedApprover = (request.designated_approver_user_ids ?? []).includes(input.userId);
  const designatedReviewer = (request.designated_reviewer_user_ids ?? []).includes(input.userId);

  // super_admin はプラットフォーム運営。テナントの管理者として扱う（my_tenant_role と同じ読み替え）。
  const tenantRole: Role = input.role === "super_admin" ? "owner" : input.role;

  let role: OutsourcedActorRole;
  if (side === "client") {
    if (tenantRole === "owner" || tenantRole === "admin") role = "client_admin";
    else if (designatedReviewer) role = "reviewer";
    else if (tenantRole === "staff") role = "client_store_staff";
    else role = "viewer";
  } else {
    if (tenantRole === "owner" || tenantRole === "admin") role = "contractor_admin";
    else if (tenantRole === "staff") role = "contractor_worker";
    else role = "viewer";
  }
  return { role, designatedApprover, side };
}

// ── 権限マトリクス（遷移を伴わない操作）PER-001〜027 ──

export const OUTSOURCED_OPERATIONS = [
  "request:create", // PER-001 作業依頼作成
  "parts:register", // PER-002 支給部品登録
  "worker:assign", // PER-009 施工担当者割当
  "verification:record", // PER-008 三方向照合（結果イベントの記録。一致なら遷移は別途）
  "correction:record", // TR-049 / EVD-017 訂正イベント（完了後）
  "rework_after_completion:request", // PER-026 完了後再施工申請
  "rework_after_completion:approve", // PER-019 再施工承認（完了後）
  "rework_after_completion:record", // PER-027 完了後再施工実施
  "evidence:generate", // AC-026 証明データ生成
  "history:view", // PER-023 証跡閲覧
] as const;
export type OutsourcedOperation = (typeof OUTSOURCED_OPERATIONS)[number];

const CLIENT_WRITERS: readonly OutsourcedActorRole[] = ["client_store_staff", "client_admin"];
const CONTRACTOR_WRITERS: readonly OutsourcedActorRole[] = ["contractor_worker", "contractor_admin"];
const ALL_ROLES: readonly OutsourcedActorRole[] = OUTSOURCED_ACTOR_ROLES;

export const OPERATION_ACTORS: Record<OutsourcedOperation, readonly OutsourcedActorRole[]> = {
  "request:create": CLIENT_WRITERS,
  "parts:register": CLIENT_WRITERS,
  "worker:assign": ["contractor_admin"],
  "verification:record": CONTRACTOR_WRITERS,
  // TR-049 の「権限保持者」: 完了記録を書いた側（施工）と承認した側（発注元）の管理者。
  "correction:record": ["client_admin", "contractor_admin"],
  "rework_after_completion:request": ["client_admin", "contractor_admin"],
  "rework_after_completion:approve": ["client_admin", "reviewer"],
  "rework_after_completion:record": CONTRACTOR_WRITERS,
  // 証明データは記録が揃った後に誰が作っても同じ内容になる。発注元管理者と施工会社管理者。
  "evidence:generate": ["client_admin", "contractor_admin"],
  "history:view": ALL_ROLES,
};

export function canOperate(actor: OutsourcedActor, op: OutsourcedOperation): boolean {
  return OPERATION_ACTORS[op].includes(actor.role);
}

// ── 遷移の実行主体（遷移表の「実行主体」列）──

/** PER-021 作業保留の権限保持者。保留解除（TR-041〜045）も同じ顔ぶれとする。 */
const HOLD_HOLDERS: readonly TransitionActor[] = ["client_store_staff", "client_admin", "contractor_admin"];

/** PER-015/016 例外承認・却下。contractor_admin / reviewer は designatedApprover のときだけ（下で判定）。 */
const EXCEPTION_APPROVERS: readonly TransitionActor[] = ["client_admin", "contractor_admin", "reviewer"];

const CLIENT_CONFIRMERS: readonly TransitionActor[] = ["client_admin", "reviewer"]; // PER-017/018

/**
 * 遷移先ごとの既定の実行主体。from で変わるものは `byFrom` で上書きする。
 * from が EXCEPTION_APPROVED / EXCEPTION_REJECTED のときはシステム制御（TR-021〜031）、
 * ON_HOLD のときは保留の権限保持者（TR-041〜045、取消は TR-046）。
 */
const TARGET_ACTORS: Record<
  OutsourcedWorkState,
  { actors: readonly TransitionActor[]; byFrom?: Partial<Record<OutsourcedWorkState, readonly TransitionActor[]>> }
> = {
  REQUEST_CREATED: { actors: [] }, // 入口は依頼作成（request:create）。遷移で入ることはない
  PARTS_PREPARED: { actors: ["client_admin"] }, // TR-001 発注元管理者の承認（PER-003）
  AWAITING_HANDOVER: { actors: CLIENT_WRITERS }, // TR-002（PER-004/005）
  RECEIPT_IN_REVIEW: { actors: CONTRACTOR_WRITERS }, // TR-003 / TR-032（PER-006）
  RECEIVED: { actors: CONTRACTOR_WRITERS }, // TR-004（PER-006/007）
  MATCHED: { actors: CONTRACTOR_WRITERS }, // TR-005（PER-008）
  READY_FOR_WORK: {
    actors: CONTRACTOR_WRITERS, // TR-006 施工担当者またはシステム
    byFrom: { WORK_INTERRUPTED: ["contractor_admin"] }, // TR-034
  },
  WORK_IN_PROGRESS: { actors: CONTRACTOR_WRITERS }, // TR-007（PER-010）
  WORK_COMPLETED: { actors: CONTRACTOR_WRITERS }, // TR-008（PER-011/012）
  AWAITING_CLIENT_CONFIRMATION: {
    actors: CLIENT_CONFIRMERS, // TR-009 / TR-038 発注元管理者または確認者
    byFrom: { RETURNED: CONTRACTOR_WRITERS }, // TR-039 記録修正は施工担当者
  },
  COMPLETED: { actors: CLIENT_CONFIRMERS }, // TR-010（PER-017）
  QUANTITY_SHORTAGE: { actors: CONTRACTOR_WRITERS }, // TR-012（PER-007）
  PART_NUMBER_MISMATCH: { actors: CONTRACTOR_WRITERS }, // TR-013
  DAMAGE_REVIEW: { actors: CONTRACTOR_WRITERS }, // TR-014 / TR-016
  RECEIPT_REJECTED: { actors: ["contractor_admin"] }, // TR-015（PER-014）
  WORK_INTERRUPTED: { actors: CONTRACTOR_WRITERS }, // TR-017（PER-013）
  // TR-018「権限保持者」: 例外を起票できるのは両社の実務者・管理者。閲覧者・確認者は申請しない。
  EXCEPTION_APPROVAL_PENDING: { actors: [...CLIENT_WRITERS, ...CONTRACTOR_WRITERS] },
  EXCEPTION_APPROVED: { actors: EXCEPTION_APPROVERS }, // TR-019（PER-015）
  EXCEPTION_REJECTED: { actors: EXCEPTION_APPROVERS }, // TR-020（PER-016）
  RETURNED: { actors: CLIENT_CONFIRMERS }, // TR-011（PER-018）
  REWORK_PENDING: { actors: ["contractor_admin"] }, // TR-035 / TR-040
  REWORK_IN_PROGRESS: { actors: CONTRACTOR_WRITERS }, // TR-036（PER-020）
  REWORK_COMPLETED: { actors: CONTRACTOR_WRITERS }, // TR-037
  ON_HOLD: { actors: HOLD_HOLDERS }, // PER-021
  CANCELED: { actors: ["client_admin"] }, // TR-033 / TR-046 / TR-047（PER-022）
};

/** from → to を起こせる実行主体。遷移表に無い組み合わせは空配列。 */
export function actorsForTransition(from: OutsourcedWorkState, to: OutsourcedWorkState): readonly TransitionActor[] {
  if (!OUTSOURCED_WORK_TRANSITIONS[from]?.includes(to)) return [];
  if (from === "EXCEPTION_APPROVED" || from === "EXCEPTION_REJECTED") return ["system"];
  if (from === "ON_HOLD") return to === "CANCELED" ? ["client_admin"] : HOLD_HOLDERS;
  const entry = TARGET_ACTORS[to];
  return entry.byFrom?.[from] ?? entry.actors;
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * 人が from → to を起こせるか。遷移表（構造）→ 実行主体（権限）の順に見る。
 * システム制御の遷移（例外承認・却下後の復帰）は人からは起こせない。service 側が
 * 承認操作の中で `system` として実行する。
 */
export function checkHumanTransition(
  actor: OutsourcedActor,
  from: OutsourcedWorkState,
  to: OutsourcedWorkState,
): TransitionCheck {
  const rejection = rejectTransition(OUTSOURCED_WORK_TRANSITIONS, "outsourcedWork", from, to);
  if (rejection) return { ok: false, reason: rejection.reason };
  const actors = actorsForTransition(from, to);
  if (actors.includes("system")) {
    return { ok: false, reason: `${from} から ${to} への遷移はシステム制御です。承認・却下の操作から行ってください。` };
  }
  if (!actors.includes(actor.role)) {
    return { ok: false, reason: `この操作（${from} → ${to}）は ${actor.role} には許可されていません。` };
  }
  // PER-015/016「設定時のみ」: 発注元管理者以外は指名されているときだけ承認・却下できる
  if (
    (to === "EXCEPTION_APPROVED" || to === "EXCEPTION_REJECTED") &&
    actor.role !== "client_admin" &&
    !actor.designatedApprover
  ) {
    return { ok: false, reason: "例外承認・却下は、この作業依頼で承認者に指名されている場合のみ行えます。" };
  }
  return { ok: true };
}

// ── 復帰先のシステム制御（PER-029 / AC-017 / AC-018）──

/** 例外承認申請・作業保留の「発生元」になりうる例外ステータス。 */
export const EXCEPTION_ORIGIN_STATES = [
  "QUANTITY_SHORTAGE",
  "PART_NUMBER_MISMATCH",
  "DAMAGE_REVIEW",
  "WORK_INTERRUPTED",
  "RETURNED",
] as const;
export type ExceptionOriginState = (typeof EXCEPTION_ORIGIN_STATES)[number];
export function isExceptionOriginState(s: unknown): s is ExceptionOriginState {
  return typeof s === "string" && (EXCEPTION_ORIGIN_STATES as readonly string[]).includes(s);
}

/**
 * 例外承認済み（TR-021〜025）／作業保留解除（TR-041〜045）で許される復帰先。
 * 発生工程で絞る: 受領時の例外は受領の工程へ、施工中断は施工待ちか再施工、差戻しは
 * 完了確認か再施工。表の上限集合（遷移表）とここの両方に入るものだけが選べる。
 */
export function allowedReturnTargets(origin: ExceptionOriginState): readonly OutsourcedWorkState[] {
  switch (origin) {
    case "QUANTITY_SHORTAGE":
    case "PART_NUMBER_MISMATCH":
    case "DAMAGE_REVIEW":
      return ["RECEIPT_IN_REVIEW", "RECEIVED", "READY_FOR_WORK"];
    case "WORK_INTERRUPTED":
      return ["READY_FOR_WORK", "REWORK_PENDING"];
    case "RETURNED":
      return ["AWAITING_CLIENT_CONFIRMATION", "REWORK_PENDING"];
  }
}

/** 例外却下後の復帰先は申請の原因になった例外ステータス（TR-027〜031 / AC-018）。 */
export function rejectionReturnTarget(origin: ExceptionOriginState): OutsourcedWorkState {
  return origin;
}

/** TR-047 の「取消可能ステータス」: 遷移表で CANCELED へ行ける状態。 */
export function isCancelable(state: OutsourcedWorkState): boolean {
  return OUTSOURCED_WORK_TRANSITIONS[state]?.includes("CANCELED") ?? false;
}
