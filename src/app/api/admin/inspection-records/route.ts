import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  inspectionPhotoPathError,
  inspectionRecordCreateSchema,
  inspectionRecordUpdateSchema,
} from "@/lib/validations/inspection";
import { retentionUntilYears, isRetentionExpired } from "@/lib/retention";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import { changedFields } from "@/lib/inspection/auditDiff";
import { evaluateCompletionInspectorGate } from "@/lib/staff/inspectorQualification";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧 / 詳細で返すカラム。vehicles / inspection_templates を join する。
 * vehicles の実カラムは plate_display / maker / model（core_tables.sql 参照）。
 */
const SELECT_COLUMNS = `
  id, template_id, reservation_id, vehicle_id, customer_id, inspection_type,
  answers, photo_urls, template_name, template_items, inspector_name,
  inspector_staff_id, inspector_qualification_snapshot,
  inspected_at, notes, record_retention_until, created_at, updated_at,
  vehicle:vehicles ( id, maker, model, plate_display ),
  template:inspection_templates ( id, name ),
  measurements:inspection_measurements ( count )
`;

// ─── GET: 点検記録一覧 ───
export const GET = withCaller(
  async (req, { caller }) => {
    try {
      const url = new URL(req.url);
      const reservationId = (url.searchParams.get("reservation_id") ?? "").trim();
      const vehicleId = (url.searchParams.get("vehicle_id") ?? "").trim();

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      let query = admin
        .from("inspection_records")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .order("inspected_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (reservationId) query = query.eq("reservation_id", reservationId);
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);

      const { data: records, error } = await query;
      if (error) return apiInternalError(error, "inspection-records GET");

      return apiJson({ records: records ?? [] });
    } catch (e) {
      return apiInternalError(e, "inspection-records GET");
    }
  },
  { routeName: "inspection-records GET" },
);

// ─── POST: 点検記録作成 ───
export const POST = withCaller(
  async (req, { caller }) => {
    try {
      const parsed = inspectionRecordCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { template_id, reservation_id, vehicle_id, customer_id, inspected_at, ...rest } = parsed.data;

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // クライアント供給 ID をそのまま信頼しない: 自テナント所属を検証。
      const refError = await validateTenantRefs(admin, caller.tenantId, {
        template_id,
        reservation_id,
        vehicle_id,
        customer_id,
        inspector_staff_id: rest.inspector_staff_id,
      });
      if (refError) return apiValidationError(refError);
      const photoError = inspectionPhotoPathError(caller.tenantId, rest.photo_urls);
      if (photoError) return apiValidationError(photoError);

      // 完成検査（指定整備記録簿）の実施者資格ゲート（G1/#1）。テナントが opt-in していれば
      // 実施者が有効な自動車検査員であることを必須化（fail-closed）。実施者の資格は実施時点の
      // スナップショットとして記録簿に残す（G1/#3）。既定（未 opt-in）は非破壊で通す。
      let inspectorSnapshot: unknown = null;
      if (rest.inspection_type === "completion") {
        const gate = await evaluateCompletionInspectorGate(admin, caller.tenantId, rest.inspector_staff_id);
        if (gate.blocked) {
          return apiError({
            code: "conflict",
            message: gate.message ?? "実施者資格の要件を満たしません。",
            status: 409,
          });
        }
        inspectorSnapshot = gate.snapshot;
      }

      // template_id が指定されていれば、履歴保全のためテンプレ名 / 項目を snapshot する。
      let templateName: string | null = null;
      let templateItems: unknown[] = [];
      if (template_id) {
        const { data: tpl, error: tplErr } = await admin
          .from("inspection_templates")
          .select("name, items")
          .eq("tenant_id", caller.tenantId)
          .eq("id", template_id)
          .maybeSingle();
        if (tplErr) return apiInternalError(tplErr, "inspection-records POST template snapshot");
        if (tpl) {
          templateName = (tpl as { name: string | null }).name ?? null;
          const items = (tpl as { items: unknown }).items;
          templateItems = Array.isArray(items) ? items : [];
        }
      }

      const { data: created, error } = await admin
        .from("inspection_records")
        .insert({
          tenant_id: caller.tenantId,
          template_id,
          reservation_id,
          vehicle_id,
          customer_id,
          inspection_type: rest.inspection_type,
          answers: rest.answers,
          photo_urls: rest.photo_urls,
          template_name: templateName,
          template_items: templateItems,
          inspector_name: rest.inspector_name,
          inspector_staff_id: rest.inspector_staff_id,
          inspector_qualification_snapshot: inspectorSnapshot,
          inspected_at: inspected_at ?? new Date().toISOString(),
          notes: rest.notes,
          // 完成検査＝指定整備記録簿は2年保存。データ保持 cron はこの日付前に消さない。
          record_retention_until: rest.inspection_type === "completion" ? retentionUntilYears(2) : null,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) return apiInternalError(error, "inspection-records POST");

      // 作成の日時・作業者を監査ログに残す（第２ ２（３）/ G2）。失敗しても作成は止めない。
      await logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "inspection_record_created",
        table: "inspection_records",
        recordId: (created as { id: string }).id,
        extra: { inspection_type: rest.inspection_type, inspector_name: rest.inspector_name ?? null },
        req,
      });

      return apiJson({ ok: true, record: created }, { status: 201 });
    } catch (e) {
      return apiInternalError(e, "inspection-records POST");
    }
  },
  { minRole: "staff", routeName: "inspection-records POST" },
);

// ─── PATCH: 点検記録更新 (body に id) ───
export const PATCH = withCaller(
  async (req, { caller }) => {
    try {
      const rawBody = await req.json().catch(() => ({}));
      const parsed = inspectionRecordUpdateSchema.safeParse(rawBody);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { id, ...rest } = parsed.data;
      // **クライアントが実際に送ったキーだけ**を更新する（staff route と同じ方針）。
      // Zod の optional 変換は未送信フィールドも null に化けさせるため、これを使わずに
      // 送信キーで絞らないと、未送信の inspected_at(NOT NULL) で 23502、参照列の暗黙 null 消去を招く。
      const sentKeys = new Set(
        rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
      );

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // 参照整合は「送られた参照だけ」検証する（validateTenantRefs は null をスキップ）。
      const refError = await validateTenantRefs(admin, caller.tenantId, {
        template_id: sentKeys.has("template_id") ? (rest.template_id ?? null) : null,
        reservation_id: sentKeys.has("reservation_id") ? (rest.reservation_id ?? null) : null,
        vehicle_id: sentKeys.has("vehicle_id") ? (rest.vehicle_id ?? null) : null,
        customer_id: sentKeys.has("customer_id") ? (rest.customer_id ?? null) : null,
        inspector_staff_id: sentKeys.has("inspector_staff_id") ? (rest.inspector_staff_id ?? null) : null,
      });
      if (refError) return apiValidationError(refError);
      const photoError = inspectionPhotoPathError(caller.tenantId, rest.photo_urls);
      if (photoError) return apiValidationError(photoError);

      // 部分更新: 送信された（かつ undefined でない）キーだけを書く。
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(rest)) {
        if (sentKeys.has(k) && v !== undefined) updates[k] = v;
      }

      // 更新箇所を監査ログに残すため、更新するフィールドの**更新前の値**を先に読む（第２ ２（３）/ G2）。
      // 列は固定リテラルで持つ（check:schema が解決できるように）。差分は更新キーだけを対象にする。
      const diffKeys = Object.keys(updates).filter((k) => k !== "updated_at");
      const { data: before } = await admin
        .from("inspection_records")
        .select(
          "id, inspection_type, answers, photo_urls, inspector_name, inspector_staff_id, notes, inspected_at, template_id, reservation_id, vehicle_id, customer_id, template_name",
        )
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();

      // 完成検査の実施者資格ゲート（G1/#1・#3）。ゲートは「実施者を設定/変更するとき」か
      // 「この更新で初めて completion になるとき」だけ効かせる。無関係な項目（notes 等）の編集では
      // 効かせない —— 作成時に検証済みの記録を再ブロックしない（実施者の資格が後で失効しても過去の
      // 記録の編集を妨げない）し、inspector_qualification_snapshot を現在値で上書きしない
      // （実施時点のスナップショット＝「後の資格変更に影響されない記録」を保つ）。
      const beforeRow = before as { inspection_type?: string; inspector_staff_id?: string | null } | null;
      const isCompletion =
        (sentKeys.has("inspection_type") ? rest.inspection_type : beforeRow?.inspection_type) === "completion";
      const changingInspector = sentKeys.has("inspector_staff_id");
      const becameCompletion =
        sentKeys.has("inspection_type") &&
        rest.inspection_type === "completion" &&
        beforeRow?.inspection_type !== "completion";
      if (isCompletion && (changingInspector || becameCompletion)) {
        const effectiveStaffId = changingInspector
          ? (rest.inspector_staff_id ?? null)
          : (beforeRow?.inspector_staff_id ?? null);
        const gate = await evaluateCompletionInspectorGate(admin, caller.tenantId, effectiveStaffId);
        if (gate.blocked) {
          return apiError({
            code: "conflict",
            message: gate.message ?? "実施者資格の要件を満たしません。",
            status: 409,
          });
        }
        // 実施者が変わった/新たに completion になった時点の資格を記録する（再計算はこの時だけ）。
        updates.inspector_qualification_snapshot = gate.snapshot;
      }

      const { data: updated, error } = await admin
        .from("inspection_records")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error) return apiInternalError(error, "inspection-records PATCH");
      if (!updated) return apiValidationError("対象の点検記録が見つかりません。");

      // 実際に変わったフィールドだけを前後値つきで記録（更新箇所＋作業者＋日時）。updated_at は除外。
      const diffUpdates = Object.fromEntries(diffKeys.map((k) => [k, updates[k]]));
      const changed = changedFields(before as Record<string, unknown> | null, diffUpdates);
      await logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "inspection_record_updated",
        table: "inspection_records",
        recordId: id,
        extra: { changed },
        req,
      });

      return apiJson({ ok: true, record: updated });
    } catch (e) {
      return apiInternalError(e, "inspection-records PATCH");
    }
  },
  { minRole: "staff", routeName: "inspection-records PATCH" },
);

// ─── DELETE: 保持期限後の消去（管理者のみ・期限経過を必須・監査記録） ───
// 完成検査＝指定整備記録簿は record_retention_until で2年保存を課す（POST 参照）。保持期間中の消去は
// 保存義務（第２ ２）に反するため禁止し、**保持期限を過ぎた記録のみ** owner/admin が消去できる経路を設ける。
// 過去に staff 可視の消去ボタン＋常時ブロックを入れて撤回した反省（MISTAKE_LEDGER
// M-20261002-delete-ignored-legal-retention）を踏まえ、(1) 権限は admin 以上、(2) 期限経過を server で必須、
// (3) 消去を logTenantAuditEvent で残す、の3点を満たす。保持期限が無い記録（非・完成検査）はこの経路の対象外。
export const DELETE = withCaller(
  async (req, { caller }) => {
    try {
      const body = (await req.json().catch(() => ({}))) as { id?: unknown };
      const id = typeof body.id === "string" ? body.id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return apiValidationError("点検記録 ID が不正です。");
      }

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: rec, error: readErr } = await admin
        .from("inspection_records")
        .select("id, inspection_type, record_retention_until")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (readErr) return apiInternalError(readErr, "inspection-records DELETE read");
      if (!rec) return apiValidationError("対象の点検記録が見つかりません。");

      const retention = (rec as { record_retention_until: string | null }).record_retention_until;
      if (!retention) {
        return apiError({
          code: "conflict",
          message: "この記録には保持期限が設定されていないため、この経路では消去できません。",
          status: 409,
        });
      }
      if (!isRetentionExpired(retention)) {
        return apiError({
          code: "conflict",
          message: `保持期限（${retention}）内は消去できません。保存義務期間の経過後に消去できます。`,
          status: 409,
        });
      }

      const { error: delErr } = await admin
        .from("inspection_records")
        .delete()
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
      if (delErr) return apiInternalError(delErr, "inspection-records DELETE");

      // 消去の日時・作業者を監査ログに残す（第２ ２（３）/ G2）。
      await logTenantAuditEvent(admin, {
        tenantId: caller.tenantId,
        userId: caller.userId,
        action: "inspection_record_deleted",
        table: "inspection_records",
        recordId: id,
        extra: {
          inspection_type: (rec as { inspection_type: string | null }).inspection_type,
          record_retention_until: retention,
        },
        req,
      });

      return apiJson({ ok: true });
    } catch (e) {
      return apiInternalError(e, "inspection-records DELETE");
    }
  },
  { minRole: "admin", routeName: "inspection-records DELETE" },
);

/**
 * 指定された ID 群が caller のテナントに属するかを検証する。
 * 属さない / 存在しない場合はエラーメッセージを返す。null はスキップ。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: {
    template_id?: string | null;
    reservation_id?: string | null;
    vehicle_id?: string | null;
    customer_id?: string | null;
    inspector_staff_id?: string | null;
  },
): Promise<string | null> {
  const checks: { table: string; id: string | null | undefined; label: string }[] = [
    { table: "inspection_templates", id: refs.template_id, label: "点検テンプレート" },
    { table: "reservations", id: refs.reservation_id, label: "予約" },
    { table: "vehicles", id: refs.vehicle_id, label: "車両" },
    { table: "customers", id: refs.customer_id, label: "顧客" },
    { table: "staff_members", id: refs.inspector_staff_id, label: "検査実施者" },
  ];
  for (const c of checks) {
    if (!c.id) continue;
    const { data, error } = await admin
      .from(c.table)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", c.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return `指定された${c.label}が見つかりません。`;
  }
  return null;
}
