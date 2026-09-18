import "server-only";

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import { canonicalize, sha256Hex } from "@/lib/anchoring/certificateHashing";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";
import type { CallerInfo } from "@/lib/auth/checkRole";
import type { OutsourcedWorkState } from "@/lib/domain/states";
import { OUTSOURCED_WORK_TRANSITIONS, validNextStates } from "@/lib/domain/transitions";
import { logger } from "@/lib/logger";
import {
  allowedReturnTargets,
  canOperate,
  checkHumanTransition,
  isExceptionOriginState,
  rejectionReturnTarget,
  resolveActor,
  type OutsourcedActor,
  type OutsourcedOperation,
} from "./rules";
import {
  receivedPayloadSchema,
  workCompletedPayloadSchema,
  type CreateWorkRequestInput,
  type SuppliedPartInput,
  type TransitionInput,
  type WorkEventInput,
} from "@/lib/validations/outsourcedWork";

/**
 * 外注施工履歴 — サービス層。
 *
 * 作業依頼は発注元と施工事業者の**2テナントにまたがる**ので、テナント1つに縛る
 * createTenantScopedAdmin は使えない。service-role で行を読み、resolveActor が
 * 「caller はどちらかのテナントのメンバーか」を判定する（PER-028）。どちらでもなければ
 * not_found として返し、拒否ログを audit_logs に残す（AC-028）。
 *
 * 遷移の正当性: 構造は OUTSOURCED_WORK_TRANSITIONS、実行主体は rules.ts、
 * 遷移先ごとに必要な記録（署名・現物ライン・復帰先・理由）はここで見る。
 * 状態の更新は `.eq("status", from)` を付けて楽観ロックする（同時操作で二重遷移しない）。
 */

const EVIDENCE_SCHEMA_VERSION = "ledra-outsourced-v1";

function admin() {
  return createServiceRoleAdmin("outsourced work — 発注元と施工事業者の2テナントにまたがる作業依頼");
}

export type WorkRequestRow = {
  id: string;
  client_tenant_id: string;
  client_store_id: string | null;
  contractor_tenant_id: string;
  vehicle_id: string | null;
  vin: string;
  vehicle_label: string | null;
  work_description: string;
  due_date: string | null;
  order_number: string | null;
  customer_note: string | null;
  comment: string | null;
  status: OutsourcedWorkState;
  exception_origin_status: string | null;
  current_receipt_attempt_id: string | null;
  assigned_worker_user_id: string | null;
  designated_reviewer_user_ids: string[];
  designated_approver_user_ids: string[];
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  evidence_hash: string | null;
  evidence_generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SuppliedPartRow = {
  id: string;
  request_id: string;
  part_number: string;
  part_name: string;
  quantity: number;
  photo_paths: string[];
  label_photo_paths: string[];
  prepared_by: string | null;
  prepared_at: string | null;
  handed_over_by: string | null;
  handed_over_at: string | null;
  handover_comment: string | null;
  created_at: string;
};

export type ReceiptAttemptRow = {
  id: string;
  request_id: string;
  attempt_no: number;
  started_by: string | null;
  started_at: string;
  result: "pending" | "accepted" | "rejected";
  received_by: string | null;
  received_at: string | null;
  lines: unknown[];
  comment: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  superseded_by_attempt_id: string | null;
};

export type WorkEventRow = {
  id: string;
  request_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  actor_tenant_id: string | null;
  actor_role: string;
  reason: string | null;
  receipt_attempt_id: string | null;
  related_event_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type ServiceResult<T> =
  { ok: true; data: T } | { ok: false; code: "not_found" | "forbidden" | "validation" | "conflict"; message: string };

const REQUEST_COLUMNS =
  "id, client_tenant_id, client_store_id, contractor_tenant_id, vehicle_id, vin, vehicle_label, work_description, due_date, order_number, customer_note, comment, status, exception_origin_status, current_receipt_attempt_id, assigned_worker_user_id, designated_reviewer_user_ids, designated_approver_user_ids, approved_by, approved_at, completed_at, evidence_hash, evidence_generated_at, created_by, created_at, updated_at";

async function denied(caller: CallerInfo, requestId: string | null, operation: string, reason: string) {
  await logTenantAuditEvent(admin(), {
    tenantId: caller.tenantId,
    userId: caller.userId,
    action: "outsourced_work_denied",
    table: "outsourced_work_requests",
    recordId: requestId ?? "",
    extra: { operation, reason },
  });
}

/** 作業依頼を読み、caller のこの依頼での立場を決める。メンバーでなければ not_found（存在を教えない）。 */
async function loadForCaller(
  caller: CallerInfo,
  requestId: string,
  operation: string,
): Promise<ServiceResult<{ request: WorkRequestRow; actor: OutsourcedActor }>> {
  const { data, error } = await admin()
    .from("outsourced_work_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`work request load failed: ${error.message}`);
  const request = data as WorkRequestRow | null;
  if (!request) return { ok: false, code: "not_found", message: "作業依頼が見つかりません。" };
  const actor = resolveActor({ userId: caller.userId, tenantId: caller.tenantId, role: caller.role, request });
  if (!actor) {
    await denied(caller, requestId, operation, "not a member of either tenant");
    return { ok: false, code: "not_found", message: "作業依頼が見つかりません。" };
  }
  return { ok: true, data: { request, actor } };
}

type EventInsert = {
  request_id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  actor_user_id: string | null;
  actor_tenant_id: string | null;
  actor_role: string;
  reason?: string | null;
  receipt_attempt_id?: string | null;
  related_event_id?: string | null;
  payload?: Record<string, unknown>;
};

async function appendEvent(e: EventInsert): Promise<WorkEventRow> {
  const { data, error } = await admin()
    .from("outsourced_work_events")
    .insert({
      request_id: e.request_id,
      event_type: e.event_type,
      from_status: e.from_status ?? null,
      to_status: e.to_status ?? null,
      actor_user_id: e.actor_user_id,
      actor_tenant_id: e.actor_tenant_id,
      actor_role: e.actor_role,
      reason: e.reason ?? null,
      receipt_attempt_id: e.receipt_attempt_id ?? null,
      related_event_id: e.related_event_id ?? null,
      payload: e.payload ?? {},
    })
    .select(
      "id, request_id, event_type, from_status, to_status, actor_user_id, actor_tenant_id, actor_role, reason, receipt_attempt_id, related_event_id, payload, created_at",
    )
    .single();
  if (error) throw new Error(`work event insert failed: ${error.message}`);
  return data as WorkEventRow;
}

// ── 一覧・作成 ──

/** 発注元として繋がっている施工事業者（staff_members.linked_tenant_id で連携済みの外注テナント）。 */
export async function listContractorCandidates(tenantId: string): Promise<{ tenant_id: string; name: string }[]> {
  const db = admin();
  const { data: staff } = await db
    .from("staff_members")
    .select("linked_tenant_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("linked_tenant_id", "is", null);
  const ids = [...new Set(((staff ?? []) as { linked_tenant_id: string }[]).map((s) => s.linked_tenant_id))];
  if (ids.length === 0) return [];
  const { data: tenants } = await db.from("tenants").select("id, name, slug").in("id", ids);
  return ((tenants ?? []) as { id: string; name: string | null; slug: string | null }[]).map((t) => ({
    tenant_id: t.id,
    name: String(t.name ?? t.slug ?? ""),
  }));
}

export async function listWorkRequests(caller: CallerInfo): Promise<WorkRequestRow[]> {
  // ponytail: 店舗担当者の「自店舗・担当拠点」（PER-023）はテナント単位。店舗絞りは
  // store_memberships と繋ぐときに足す（依頼行には client_store_id を持たせてある）。
  const { data, error } = await admin()
    .from("outsourced_work_requests")
    .select(REQUEST_COLUMNS)
    .or(`client_tenant_id.eq.${caller.tenantId},contractor_tenant_id.eq.${caller.tenantId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`work request list failed: ${error.message}`);
  return (data ?? []) as WorkRequestRow[];
}

export async function createWorkRequest(
  caller: CallerInfo,
  input: CreateWorkRequestInput,
): Promise<ServiceResult<WorkRequestRow>> {
  // 作成前は行が無いので resolveActor は使えない。発注元側のロールをここで直接見る。
  const role = caller.role === "super_admin" ? "owner" : caller.role;
  if (role === "viewer") {
    await denied(caller, null, "request:create", "viewer");
    return { ok: false, code: "forbidden", message: "作業依頼を作成する権限がありません。" };
  }
  if (input.contractor_tenant_id === caller.tenantId) {
    return { ok: false, code: "validation", message: "自社を施工事業者に指定することはできません。" };
  }
  const candidates = await listContractorCandidates(caller.tenantId);
  if (!candidates.some((c) => c.tenant_id === input.contractor_tenant_id)) {
    return {
      ok: false,
      code: "validation",
      message: "連携済みの施工事業者を選んでください（外注職人の連携コードで先に連携します）。",
    };
  }
  const db = admin();
  const { data, error } = await db
    .from("outsourced_work_requests")
    .insert({
      client_tenant_id: caller.tenantId,
      client_store_id: input.client_store_id ?? null,
      contractor_tenant_id: input.contractor_tenant_id,
      vehicle_id: input.vehicle_id ?? null,
      vin: input.vin,
      vehicle_label: input.vehicle_label ?? null,
      work_description: input.work_description,
      due_date: input.due_date ?? null,
      order_number: input.order_number ?? null,
      customer_note: input.customer_note ?? null,
      comment: input.comment ?? null,
      designated_reviewer_user_ids: input.designated_reviewer_user_ids,
      designated_approver_user_ids: input.designated_approver_user_ids,
      created_by: caller.userId,
    })
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw new Error(`work request insert failed: ${error.message}`);
  const request = data as WorkRequestRow;

  if (input.parts.length > 0) {
    const { error: pErr } = await db.from("outsourced_supplied_parts").insert(
      input.parts.map((p) => ({
        request_id: request.id,
        part_number: p.part_number,
        part_name: p.part_name,
        quantity: p.quantity,
        photo_paths: p.photo_paths,
        label_photo_paths: p.label_photo_paths,
        created_by: caller.userId,
      })),
    );
    if (pErr) throw new Error(`supplied parts insert failed: ${pErr.message}`);
  }

  const actor = resolveActor({ userId: caller.userId, tenantId: caller.tenantId, role: caller.role, request });
  await appendEvent({
    request_id: request.id,
    event_type: "REQUEST_CREATED",
    to_status: request.status,
    actor_user_id: caller.userId,
    actor_tenant_id: caller.tenantId,
    actor_role: actor?.role ?? "client_store_staff",
    payload: { parts: input.parts.length, due_date: input.due_date ?? null },
  });
  return { ok: true, data: request };
}

export async function addSuppliedPart(
  caller: CallerInfo,
  requestId: string,
  part: SuppliedPartInput,
): Promise<ServiceResult<SuppliedPartRow>> {
  const loaded = await loadForCaller(caller, requestId, "parts:register");
  if (!loaded.ok) return loaded;
  const { request, actor } = loaded.data;
  if (!canOperate(actor, "parts:register")) {
    await denied(caller, requestId, "parts:register", actor.role);
    return { ok: false, code: "forbidden", message: "支給部品を登録する権限がありません。" };
  }
  // AC-002: 承認で内容が固定される。以後の追加は訂正イベントか新しい依頼で。
  if (request.status !== "REQUEST_CREATED") {
    return { ok: false, code: "conflict", message: "承認済みの作業依頼には部品を追加できません。" };
  }
  const { data, error } = await admin()
    .from("outsourced_supplied_parts")
    .insert({
      request_id: requestId,
      part_number: part.part_number,
      part_name: part.part_name,
      quantity: part.quantity,
      photo_paths: part.photo_paths,
      label_photo_paths: part.label_photo_paths,
      created_by: caller.userId,
    })
    .select(
      "id, request_id, part_number, part_name, quantity, photo_paths, label_photo_paths, prepared_by, prepared_at, handed_over_by, handed_over_at, handover_comment, created_at",
    )
    .single();
  if (error) throw new Error(`supplied part insert failed: ${error.message}`);
  await appendEvent({
    request_id: requestId,
    event_type: "PART_ADDED",
    actor_user_id: caller.userId,
    actor_tenant_id: caller.tenantId,
    actor_role: actor.role,
    payload: { part_id: (data as SuppliedPartRow).id, part_number: part.part_number, quantity: part.quantity },
  });
  return { ok: true, data: data as SuppliedPartRow };
}

// ── 詳細 ──

export type NextAction = {
  to: OutsourcedWorkState;
  /** 例外承認済み・保留解除で選べる復帰先（該当しない遷移は空）。 */
  return_targets: readonly OutsourcedWorkState[];
};

export type WorkRequestDetail = {
  request: WorkRequestRow;
  actor: OutsourcedActor;
  parts: SuppliedPartRow[];
  receipt_attempts: ReceiptAttemptRow[];
  events: WorkEventRow[];
  next_actions: NextAction[];
  operations: OutsourcedOperation[];
};

export async function getWorkRequestDetail(
  caller: CallerInfo,
  requestId: string,
): Promise<ServiceResult<WorkRequestDetail>> {
  const loaded = await loadForCaller(caller, requestId, "history:view");
  if (!loaded.ok) return loaded;
  const { request, actor } = loaded.data;
  const db = admin();
  const [parts, attempts, events] = await Promise.all([
    db
      .from("outsourced_supplied_parts")
      .select(
        "id, request_id, part_number, part_name, quantity, photo_paths, label_photo_paths, prepared_by, prepared_at, handed_over_by, handed_over_at, handover_comment, created_at",
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),
    db
      .from("outsourced_receipt_attempts")
      .select(
        "id, request_id, attempt_no, started_by, started_at, result, received_by, received_at, lines, comment, rejected_by, rejected_at, rejection_reason, superseded_by_attempt_id",
      )
      .eq("request_id", requestId)
      .order("attempt_no", { ascending: true }),
    db
      .from("outsourced_work_events")
      .select(
        "id, request_id, event_type, from_status, to_status, actor_user_id, actor_tenant_id, actor_role, reason, receipt_attempt_id, related_event_id, payload, created_at",
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),
  ]);
  for (const r of [parts, attempts, events])
    if (r.error) throw new Error(`work request detail failed: ${r.error.message}`);

  const origin = isExceptionOriginState(request.exception_origin_status) ? request.exception_origin_status : null;
  const next_actions: NextAction[] = [];
  for (const to of validNextStates(OUTSOURCED_WORK_TRANSITIONS, request.status)) {
    if (!checkHumanTransition(actor, request.status, to).ok) continue;
    let return_targets: readonly OutsourcedWorkState[] = [];
    if (to === "EXCEPTION_APPROVED" && origin) return_targets = allowedReturnTargets(origin);
    next_actions.push({ to, return_targets });
  }
  // 保留解除（ON_HOLD からの人の遷移）は復帰先そのものが to。origin で絞る（PER-029）
  const filtered =
    request.status === "ON_HOLD" && origin
      ? next_actions.filter((a) => a.to === "CANCELED" || allowedReturnTargets(origin).includes(a.to))
      : next_actions;

  const operations = (
    [
      "parts:register",
      "worker:assign",
      "verification:record",
      "correction:record",
      "rework_after_completion:request",
      "rework_after_completion:record",
      "evidence:generate",
    ] as const
  ).filter((op) => canOperate(actor, op));

  return {
    ok: true,
    data: {
      request,
      actor,
      parts: (parts.data ?? []) as SuppliedPartRow[],
      receipt_attempts: (attempts.data ?? []) as ReceiptAttemptRow[],
      events: (events.data ?? []) as WorkEventRow[],
      next_actions: filtered,
      operations,
    },
  };
}

// ── 遷移 ──

async function openReceiptAttempt(request: WorkRequestRow, userId: string): Promise<ReceiptAttemptRow> {
  const db = admin();
  const { count } = await db
    .from("outsourced_receipt_attempts")
    .select("id", { count: "exact", head: true })
    .eq("request_id", request.id);
  const attempt_no = (count ?? 0) + 1;
  const { data, error } = await db
    .from("outsourced_receipt_attempts")
    .insert({ request_id: request.id, attempt_no, started_by: userId })
    .select(
      "id, request_id, attempt_no, started_by, started_at, result, received_by, received_at, lines, comment, rejected_by, rejected_at, rejection_reason, superseded_by_attempt_id",
    )
    .single();
  if (error) throw new Error(`receipt attempt insert failed: ${error.message}`);
  const attempt = data as ReceiptAttemptRow;
  // AC-014: 拒否した旧試行 → 新試行のリンク（旧側は上書きせず、後継 ID だけ足す）
  if (request.current_receipt_attempt_id) {
    await db
      .from("outsourced_receipt_attempts")
      .update({ superseded_by_attempt_id: attempt.id })
      .eq("id", request.current_receipt_attempt_id)
      .is("superseded_by_attempt_id", null);
  }
  return attempt;
}

/** 遷移先ごとに必要な記録が揃っているか（AC-002 / AC-004 / AC-007 など）。 */
async function validateTransitionPayload(
  request: WorkRequestRow,
  to: OutsourcedWorkState,
  input: TransitionInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const needsReason: OutsourcedWorkState[] = [
    "QUANTITY_SHORTAGE",
    "PART_NUMBER_MISMATCH",
    "DAMAGE_REVIEW",
    "RECEIPT_REJECTED",
    "WORK_INTERRUPTED",
    "EXCEPTION_APPROVAL_PENDING",
    "EXCEPTION_REJECTED",
    "RETURNED",
    "REWORK_PENDING",
    "ON_HOLD",
    "CANCELED",
  ];
  if ((needsReason.includes(to) || request.status === "ON_HOLD") && !input.reason?.trim()) {
    return { ok: false, message: "理由を入力してください。" };
  }
  if (to === "PARTS_PREPARED") {
    const { count } = await admin()
      .from("outsourced_supplied_parts")
      .select("id", { count: "exact", head: true })
      .eq("request_id", request.id);
    if (!count) return { ok: false, message: "支給部品を1件以上登録してから承認してください。" };
    if (!request.due_date) return { ok: false, message: "作業期限を登録してから承認してください。" };
  }
  if (to === "RECEIVED" && request.status === "RECEIPT_IN_REVIEW") {
    const parsed = receivedPayloadSchema.safeParse(input.payload);
    if (!parsed.success) return { ok: false, message: "受領した部品ごとの数量・品番・状態を登録してください。" };
  }
  if (to === "MATCHED" && input.payload.verification_result !== "MATCH") {
    return { ok: false, message: "照合結果が「一致」のときだけ照合済みへ進めます。" };
  }
  if (to === "WORK_COMPLETED" || to === "REWORK_COMPLETED") {
    const parsed = workCompletedPayloadSchema.safeParse(input.payload);
    if (!parsed.success) return { ok: false, message: "使用部品・写真・施工者署名を登録してください。" };
  }
  if (to === "EXCEPTION_APPROVED") {
    const origin = request.exception_origin_status;
    if (!isExceptionOriginState(origin)) return { ok: false, message: "例外の発生元が記録されていません。" };
    if (!input.return_to || !allowedReturnTargets(origin).includes(input.return_to)) {
      return { ok: false, message: `復帰先は ${allowedReturnTargets(origin).join(" / ")} のいずれかです。` };
    }
  }
  if (request.status === "ON_HOLD" && to !== "CANCELED") {
    const origin = request.exception_origin_status;
    if (isExceptionOriginState(origin) && !allowedReturnTargets(origin).includes(to)) {
      return { ok: false, message: `この保留の復帰先は ${allowedReturnTargets(origin).join(" / ")} のいずれかです。` };
    }
  }
  return { ok: true };
}

/**
 * 状態を from → to に進め、STATUS_TRANSITION イベントを追記する。
 * `.eq("status", from)` で同時操作を弾く（0件更新なら conflict）。
 */
async function applyTransition(args: {
  request: WorkRequestRow;
  to: OutsourcedWorkState;
  patch: Record<string, unknown>;
  event: Omit<EventInsert, "request_id" | "event_type" | "from_status" | "to_status">;
}): Promise<ServiceResult<{ request: WorkRequestRow; event: WorkEventRow }>> {
  const { request, to, patch, event } = args;
  const { data, error } = await admin()
    .from("outsourced_work_requests")
    .update({ status: to, ...patch })
    .eq("id", request.id)
    .eq("status", request.status)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`work request transition failed: ${error.message}`);
  if (!data)
    return { ok: false, code: "conflict", message: "他の操作で状態が変わっています。画面を更新してください。" };
  const ev = await appendEvent({
    ...event,
    request_id: request.id,
    event_type: "STATUS_TRANSITION",
    from_status: request.status,
    to_status: to,
  });
  return { ok: true, data: { request: data as WorkRequestRow, event: ev } };
}

export async function transitionWorkRequest(
  caller: CallerInfo,
  requestId: string,
  input: TransitionInput,
): Promise<ServiceResult<{ request: WorkRequestRow; events: WorkEventRow[] }>> {
  const loaded = await loadForCaller(caller, requestId, `transition:${input.to}`);
  if (!loaded.ok) return loaded;
  const { request, actor } = loaded.data;

  const check = checkHumanTransition(actor, request.status, input.to);
  if (!check.ok) {
    // TR-048 / AC-024 / AC-028: 拒否は記録に残す（遷移拒否ログ）。記録変更は起きない。
    await denied(caller, requestId, `transition:${request.status}->${input.to}`, check.reason);
    return { ok: false, code: request.status === "COMPLETED" ? "conflict" : "forbidden", message: check.reason };
  }
  const valid = await validateTransitionPayload(request, input.to, input);
  if (!valid.ok) return { ok: false, code: "validation", message: valid.message };

  const db = admin();
  const to = input.to;
  const patch: Record<string, unknown> = {};
  let receiptAttemptId: string | null = request.current_receipt_attempt_id;
  const payload: Record<string, unknown> = { ...input.payload };

  // ── 遷移先ごとの付随記録 ──
  if (to === "PARTS_PREPARED") {
    patch.approved_by = caller.userId;
    patch.approved_at = new Date().toISOString();
  }
  if (to === "AWAITING_HANDOVER") {
    // TR-002: 準備・引渡しの担当者と日時を部品側にも残す（未記入のものだけ）
    const now = new Date().toISOString();
    await db
      .from("outsourced_supplied_parts")
      .update({ prepared_by: caller.userId, prepared_at: now })
      .eq("request_id", request.id)
      .is("prepared_at", null);
    await db
      .from("outsourced_supplied_parts")
      .update({ handed_over_by: caller.userId, handed_over_at: now, handover_comment: input.reason ?? null })
      .eq("request_id", request.id)
      .is("handed_over_at", null);
  }
  if (to === "RECEIPT_IN_REVIEW") {
    // TR-003 / TR-032 / TR-041: 受領確認中へ入るたびに新しい受領試行（拒否前の記録は上書きしない）
    const attempt = await openReceiptAttempt(request, caller.userId);
    receiptAttemptId = attempt.id;
    patch.current_receipt_attempt_id = attempt.id;
    payload.receipt_attempt_no = attempt.attempt_no;
  }
  if (to === "RECEIVED" && request.status === "RECEIPT_IN_REVIEW" && receiptAttemptId) {
    const parsed = receivedPayloadSchema.parse(input.payload);
    await db
      .from("outsourced_receipt_attempts")
      .update({
        result: "accepted",
        received_by: caller.userId,
        received_at: new Date().toISOString(),
        lines: parsed.lines,
        comment: parsed.comment ?? null,
      })
      .eq("id", receiptAttemptId)
      .eq("result", "pending");
  }
  if (to === "RECEIPT_REJECTED" && receiptAttemptId) {
    // TR-015 / AC-013: この受領試行の終端
    await db
      .from("outsourced_receipt_attempts")
      .update({
        result: "rejected",
        rejected_by: caller.userId,
        rejected_at: new Date().toISOString(),
        rejection_reason: input.reason ?? null,
      })
      .eq("id", receiptAttemptId)
      .eq("result", "pending");
  }
  if (
    to === "QUANTITY_SHORTAGE" ||
    to === "PART_NUMBER_MISMATCH" ||
    to === "DAMAGE_REVIEW" ||
    to === "WORK_INTERRUPTED" ||
    to === "RETURNED"
  ) {
    if (request.status !== "EXCEPTION_REJECTED") patch.exception_origin_status = to; // 発生元を記録（PER-029）
  }
  if (to === "EXCEPTION_APPROVAL_PENDING" || to === "ON_HOLD") {
    if (isExceptionOriginState(request.status)) patch.exception_origin_status = request.status;
  }
  if (request.status === "ON_HOLD" && to !== "CANCELED") patch.exception_origin_status = null;
  if (to === "COMPLETED") patch.completed_at = new Date().toISOString();

  const first = await applyTransition({
    request,
    to,
    patch,
    event: {
      actor_user_id: caller.userId,
      actor_tenant_id: caller.tenantId,
      actor_role: actor.role,
      reason: input.reason ?? null,
      receipt_attempt_id: receiptAttemptId,
      payload,
    },
  });
  if (!first.ok) return first;
  const events = [first.data.event];
  let current = first.data.request;

  // ── システム制御の後続遷移（TR-021〜031）──
  if (to === "EXCEPTION_APPROVED" || to === "EXCEPTION_REJECTED") {
    const origin = current.exception_origin_status;
    if (!isExceptionOriginState(origin)) throw new Error("exception origin missing after approval"); // validate 済みなので到達しない
    const target =
      to === "EXCEPTION_APPROVED" ? (input.return_to as OutsourcedWorkState) : rejectionReturnTarget(origin);
    const sysPatch: Record<string, unknown> = {};
    let sysAttempt: string | null = current.current_receipt_attempt_id;
    if (target === "RECEIPT_IN_REVIEW") {
      const attempt = await openReceiptAttempt(current, caller.userId);
      sysAttempt = attempt.id;
      sysPatch.current_receipt_attempt_id = attempt.id;
    }
    if (to === "EXCEPTION_APPROVED") sysPatch.exception_origin_status = null;
    const second = await applyTransition({
      request: current,
      to: target,
      patch: sysPatch,
      event: {
        actor_user_id: null,
        actor_tenant_id: null,
        actor_role: "system",
        reason: to === "EXCEPTION_APPROVED" ? "例外承認に基づく復帰" : "例外却下に基づく原因ステータスへの復帰",
        receipt_attempt_id: sysAttempt,
        related_event_id: first.data.event.id,
        payload: { approval_event_id: first.data.event.id, origin, return_to: target },
      },
    });
    if (!second.ok) return second;
    events.push(second.data.event);
    current = second.data.request;
  }

  return { ok: true, data: { request: current, events } };
}

// ── 遷移を伴わないイベント ──

export async function recordWorkEvent(
  caller: CallerInfo,
  requestId: string,
  input: WorkEventInput,
): Promise<ServiceResult<{ request: WorkRequestRow; events: WorkEventRow[] }>> {
  const loaded = await loadForCaller(caller, requestId, `event:${input.type}`);
  if (!loaded.ok) return loaded;
  const { request, actor } = loaded.data;
  const base = {
    request_id: request.id,
    actor_user_id: caller.userId,
    actor_tenant_id: caller.tenantId,
    actor_role: actor.role,
  };

  const forbid = async (op: OutsourcedOperation) => {
    await denied(caller, requestId, op, actor.role);
    return { ok: false as const, code: "forbidden" as const, message: "この操作を行う権限がありません。" };
  };

  switch (input.type) {
    case "VERIFICATION": {
      if (!canOperate(actor, "verification:record")) return forbid("verification:record");
      if (request.status !== "RECEIVED")
        return { ok: false, code: "conflict", message: "照合は受領済みの状態で行います。" };
      if (input.result !== "MATCH" && !input.reason?.trim())
        return { ok: false, code: "validation", message: "要確認・不一致の理由を入力してください。" };
      const ev = await appendEvent({
        ...base,
        event_type: "VERIFICATION",
        reason: input.reason ?? null,
        receipt_attempt_id: request.current_receipt_attempt_id,
        payload: { result: input.result, comment: input.comment ?? null },
      });
      if (input.result !== "MATCH") return { ok: true, data: { request, events: [ev] } }; // AC-005: 施工開始が止まる（状態は受領済みのまま）
      const t = await transitionWorkRequest(caller, requestId, {
        to: "MATCHED",
        reason: input.comment ?? null,
        return_to: null,
        payload: { verification_result: "MATCH", verification_event_id: ev.id },
      });
      if (!t.ok) return t;
      return { ok: true, data: { request: t.data.request, events: [ev, ...t.data.events] } };
    }
    case "WORKER_ASSIGNED": {
      if (!canOperate(actor, "worker:assign")) return forbid("worker:assign");
      const { data: member } = await admin()
        .from("tenant_memberships")
        .select("id")
        .eq("tenant_id", request.contractor_tenant_id)
        .eq("user_id", input.user_id)
        .maybeSingle();
      if (!member) return { ok: false, code: "validation", message: "施工事業者のメンバーだけを割り当てられます。" };
      const { data, error } = await admin()
        .from("outsourced_work_requests")
        .update({ assigned_worker_user_id: input.user_id })
        .eq("id", request.id)
        .select(REQUEST_COLUMNS)
        .single();
      if (error) throw new Error(`worker assign failed: ${error.message}`);
      const ev = await appendEvent({
        ...base,
        event_type: "WORKER_ASSIGNED",
        payload: { user_id: input.user_id, previous: request.assigned_worker_user_id },
      });
      return { ok: true, data: { request: data as WorkRequestRow, events: [ev] } };
    }
    case "CORRECTION": {
      if (!canOperate(actor, "correction:record")) return forbid("correction:record");
      if (request.status !== "COMPLETED")
        return {
          ok: false,
          code: "conflict",
          message: "訂正イベントは完了後の記録に対して登録します。完了前は該当の工程で修正してください。",
        };
      const ev = await appendEvent({
        ...base,
        event_type: "CORRECTION",
        reason: input.reason,
        payload: { target: input.target, before: input.before ?? null, after: input.after ?? null },
      });
      return { ok: true, data: { request, events: [ev] } };
    }
    case "POST_COMPLETION_REWORK_REQUESTED": {
      if (!canOperate(actor, "rework_after_completion:request")) return forbid("rework_after_completion:request");
      if (request.status !== "COMPLETED")
        return { ok: false, code: "conflict", message: "完了後再施工は完了した作業依頼にだけ申請できます。" };
      const ev = await appendEvent({
        ...base,
        event_type: "POST_COMPLETION_REWORK_REQUESTED",
        reason: input.reason,
        payload: { post_completion: true },
      });
      return { ok: true, data: { request, events: [ev] } };
    }
    case "POST_COMPLETION_REWORK_APPROVED": {
      // PER-019 再施工承認: 発注元管理者または確認者
      if (actor.role !== "client_admin" && actor.role !== "reviewer") return forbid("rework_after_completion:request");
      if (request.status !== "COMPLETED")
        return { ok: false, code: "conflict", message: "完了した作業依頼ではありません。" };
      const { data: req } = await admin()
        .from("outsourced_work_events")
        .select("id")
        .eq("request_id", request.id)
        .eq("event_type", "POST_COMPLETION_REWORK_REQUESTED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!req) return { ok: false, code: "conflict", message: "先に完了後再施工の申請を登録してください。" };
      const ev = await appendEvent({
        ...base,
        event_type: "POST_COMPLETION_REWORK_APPROVED",
        reason: input.reason ?? null,
        related_event_id: (req as { id: string }).id,
        payload: { post_completion: true },
      });
      return { ok: true, data: { request, events: [ev] } };
    }
    case "POST_COMPLETION_REWORK_RECORDED": {
      if (!canOperate(actor, "rework_after_completion:record")) return forbid("rework_after_completion:record");
      if (request.status !== "COMPLETED")
        return { ok: false, code: "conflict", message: "完了した作業依頼ではありません。" };
      // AC-021: 発注元管理者の承認が先。承認イベントが無ければ記録できない
      const { data: approval } = await admin()
        .from("outsourced_work_events")
        .select("id")
        .eq("request_id", request.id)
        .eq("event_type", "POST_COMPLETION_REWORK_APPROVED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!approval) return { ok: false, code: "conflict", message: "完了後再施工は発注元の承認後に記録できます。" };
      const { reason, ...rest } = input;
      const ev = await appendEvent({
        ...base,
        event_type: "POST_COMPLETION_REWORK_RECORDED",
        reason,
        related_event_id: (approval as { id: string }).id,
        payload: { ...rest, type: undefined, post_completion: true, initial_completed_at: request.completed_at },
      });
      return { ok: true, data: { request, events: [ev] } };
    }
  }
}

// ── 証明データ（AC-026 / EVD-018 / AC-029）──

export async function generateEvidence(
  caller: CallerInfo,
  requestId: string,
): Promise<ServiceResult<{ hash: string; anchored: boolean; tx_hash: string | null; event: WorkEventRow }>> {
  const detail = await getWorkRequestDetail(caller, requestId);
  if (!detail.ok) return detail;
  const { request, actor, parts, receipt_attempts, events } = detail.data;
  if (!canOperate(actor, "evidence:generate")) {
    await denied(caller, requestId, "evidence:generate", actor.role);
    return { ok: false, code: "forbidden", message: "証明データを生成する権限がありません。" };
  }
  if (request.status !== "COMPLETED" && request.status !== "CANCELED") {
    return { ok: false, code: "conflict", message: "証明データは完了または作業取消の作業依頼に対して生成します。" };
  }
  // 顧客情報（customer_note）は証明データに含めない。ハッシュ対象は作業・部品・受領・照合・施工・承認の記録。
  const canonical = canonicalize({
    schema_version: EVIDENCE_SCHEMA_VERSION,
    request: {
      id: request.id,
      client_tenant_id: request.client_tenant_id,
      contractor_tenant_id: request.contractor_tenant_id,
      vin: request.vin,
      vehicle_label: request.vehicle_label,
      work_description: request.work_description,
      due_date: request.due_date,
      order_number: request.order_number,
      status: request.status,
      approved_at: request.approved_at,
      completed_at: request.completed_at,
    },
    parts: parts.map((p) => ({
      id: p.id,
      part_number: p.part_number,
      part_name: p.part_name,
      quantity: p.quantity,
      prepared_at: p.prepared_at,
      handed_over_at: p.handed_over_at,
    })),
    receipt_attempts: receipt_attempts.map((a) => ({
      id: a.id,
      attempt_no: a.attempt_no,
      result: a.result,
      received_at: a.received_at,
      lines: a.lines,
      rejected_at: a.rejected_at,
      rejection_reason: a.rejection_reason,
    })),
    events: events
      .filter((e) => e.event_type !== "EVIDENCE_GENERATED")
      .map((e) => ({
        id: e.id,
        type: e.event_type,
        from: e.from_status,
        to: e.to_status,
        actor_role: e.actor_role,
        actor_user_id: e.actor_user_id,
        reason: e.reason,
        payload: e.payload,
        at: e.created_at,
      })),
  });
  const hash = sha256Hex(canonical);

  // 既存の改ざん検知基盤（Polygon アンカー）へ送る。無効なら anchored=false で記録だけ残す。失敗で証明生成は止めない
  let anchor = { txHash: null as string | null, anchored: false, network: null as string | null };
  try {
    anchor = await anchorToPolygon(hash);
  } catch (e) {
    logger.warn("outsourced evidence anchor failed", { requestId, error: e instanceof Error ? e.message : String(e) });
  }

  const now = new Date().toISOString();
  const ev = await appendEvent({
    request_id: request.id,
    event_type: "EVIDENCE_GENERATED",
    actor_user_id: caller.userId,
    actor_tenant_id: caller.tenantId,
    actor_role: actor.role,
    payload: {
      hash,
      schema_version: EVIDENCE_SCHEMA_VERSION,
      generated_at: now,
      anchor: { anchored: anchor.anchored, tx_hash: anchor.txHash, network: anchor.network, sent_at: now },
    },
  });
  const { error } = await admin()
    .from("outsourced_work_requests")
    .update({ evidence_hash: hash, evidence_generated_at: now })
    .eq("id", request.id);
  if (error) throw new Error(`evidence hash update failed: ${error.message}`);
  return { ok: true, data: { hash, anchored: anchor.anchored, tx_hash: anchor.txHash, event: ev } };
}
