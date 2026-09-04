import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { syncCreateEvent, syncUpdateEvent, syncDeleteEvent } from "@/lib/gcal/client";
import { enforceBilling } from "@/lib/billing/guard";
import { parsePagination } from "@/lib/api/pagination";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { logger } from "@/lib/logger";
import {
  reservationCreateSchema,
  reservationDeleteSchema,
  reservationUpdateSchema,
} from "@/lib/validations/reservation";
import { maybeAutoDraftCertificateForReservation } from "@/lib/ai/automation/certificateAuto";
import { maybeAutoCreateDraftCertificateForReservation } from "@/lib/ai/automation/certificateRecordAuto";
import { maybeAutoCreateDraftInvoiceForReservation } from "@/lib/ai/automation/invoiceRecordAuto";
import { maybeAutoCategorizeReservationOnIntake } from "@/lib/ai/automation/accountingAuto";
import { maybeAutoProposeWorkflowForReservation } from "@/lib/ai/automation/workflowAuto";
import { maybeAutoSuggestAssigneeForReservation } from "@/lib/ai/automation/assigneeAuto";
import { createDraftPartInstallationForReservation } from "@/lib/parts/installationService";
import { resolveStoreId, STORE_ERROR_MESSAGES } from "@/lib/stores/resolveStoreId";
import { businessDateString } from "@/lib/datetime";

export const dynamic = "force-dynamic";

/**
 * assigned_staff_id / booth_id が呼び出し元テナントのものか検証する。
 * FK は staff_members(id) / booths(id) を参照するがテナント制約は無いため、
 * リークした UUID で他テナントの行を指すクロステナント結合を防ぐ。
 * null/undefined（未指定・割当解除）は許可。問題があればエラーキーを返す。
 *
 * staff_members の SELECT は RLS で管理ロール限定のため、staff ロールの発行者でも
 * 検証できるようサービスロール（tenant 限定）で存在確認する。
 */
async function validateReservationRefs(
  tenantId: string,
  assignedStaffId: string | null | undefined,
  boothId: string | null | undefined,
  workflowTemplateId?: string | null | undefined,
  loanerCarId?: string | null | undefined,
): Promise<string | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  if (assignedStaffId) {
    const { data } = await admin
      .from("staff_members")
      .select("id")
      .eq("id", assignedStaffId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return "assigned_staff_not_found";
  }
  if (boothId) {
    const { data } = await admin.from("booths").select("id").eq("id", boothId).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return "booth_not_found";
  }
  if (workflowTemplateId) {
    // workflow_templates は自テナントに加えプラットフォーム共通(is_platform)も選択可。
    const { data } = await admin
      .from("workflow_templates")
      .select("id")
      .eq("id", workflowTemplateId)
      .or(`tenant_id.eq.${tenantId},is_platform.eq.true`)
      .maybeSingle();
    if (!data) return "workflow_template_not_found";
  }
  if (loanerCarId) {
    const { data } = await admin
      .from("loaner_cars")
      .select("id")
      .eq("id", loanerCarId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return "loaner_car_not_found";
  }
  return null;
}

// ─── GET: 予約一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const dateFrom = url.searchParams.get("from") ?? "";
    const dateTo = url.searchParams.get("to") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const view = url.searchParams.get("view") ?? "";
    const pagination = parsePagination(req);

    let query = supabase
      .from("reservations")
      .select(
        "id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, all_day, start_time, end_time, assigned_user_id, assigned_staff_id, booth_id, loaner_car_id, status, estimated_amount, created_at, workflow_template_id, current_step_key, current_step_order, progress_pct",
        { count: "exact" },
      )
      .eq("tenant_id", caller.tenantId)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (dateFrom && view !== "storefront") {
      query = query.gte("scheduled_date", dateFrom);
    }
    if (dateTo && view !== "storefront") {
      query = query.lte("scheduled_date", dateTo);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    // 店頭画面は全履歴を定期取得しない。本日分と、日を跨いだ未完了作業だけに絞る。
    // 最大200件は事故的な大量描画を防ぐ安全弁。通常一覧の互換性は維持する。
    if (view === "storefront") {
      const requestedDate = url.searchParams.get("date");
      const businessDate =
        requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : businessDateString();
      const requestedFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : businessDate;
      const requestedTo = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : requestedFrom;
      const rangeStart = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
      const rangeEnd = requestedFrom <= requestedTo ? requestedTo : requestedFrom;
      query = query
        .or(`and(scheduled_date.gte.${rangeStart},scheduled_date.lte.${rangeEnd}),status.in.(arrived,in_progress)`)
        .neq("status", "cancelled")
        .range(0, 199);
    }

    // Apply pagination if page param was provided
    if (pagination.page > 0 && view !== "storefront") {
      query = query.range(pagination.from, pagination.to);
    }

    const { data: reservations, error, count } = await query;
    if (error) {
      return apiInternalError(error, "reservations list");
    }

    // 顧客名を取得
    const customerIds = [...new Set((reservations ?? []).map((r) => r.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = c.name;
      });
    }

    // 車両情報を取得
    const vehicleIds = [...new Set((reservations ?? []).map((r) => r.vehicle_id).filter(Boolean))];
    const vehicleMap: Record<string, string> = {};
    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display")
        .in("id", vehicleIds);
      (vehicles ?? []).forEach((v) => {
        const label = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || "車両";
        vehicleMap[v.id] = v.plate_display ? `${label} / ${v.plate_display}` : label;
      });
    }

    const enriched = (reservations ?? []).map((r) => ({
      ...r,
      customer_name: r.customer_id ? (customerMap[r.customer_id] ?? null) : null,
      vehicle_label: r.vehicle_id ? (vehicleMap[r.vehicle_id] ?? null) : null,
    }));

    // 統計: 一覧の既定フィルタ (from=today 等) に引きずられず、常にテナント全体
    // (status/customer_id 絞り込みのみ反映) の集計にする。ダッシュボードKPIとして
    // 「一覧で今何を表示しているか」ではなく「テナント全体の状況」を表すため。
    const today = businessDateString();
    const statsBase = () => {
      let q = supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId);
      if (status && status !== "all") q = q.eq("status", status);
      if (customerId) q = q.eq("customer_id", customerId);
      return q;
    };
    const [totalStats, todayStats, activeStats] = await Promise.all([
      statsBase(),
      statsBase().eq("scheduled_date", today).neq("status", "cancelled"),
      statsBase().neq("status", "cancelled").neq("status", "completed"),
    ]);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        reservations: enriched,
        stats: {
          total: totalStats.count ?? 0,
          today_count: todayStats.count ?? 0,
          active_count: activeStats.count ?? 0,
        },
        ...(pagination.page > 0 && { page: pagination.page, per_page: pagination.perPage, total: count ?? 0 }),
      },
      { headers },
    );
  } catch (e: unknown) {
    return apiInternalError(e, "reservations list");
  }
}

// ─── POST: 予約作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 予約の作成は編集権限が必要（viewer は不可）。RLS は同テナントなら書込を許すため、
    // サイドバー非表示だけでなく API 層でもロールを強制する。
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = reservationCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const refErr = await validateReservationRefs(
      caller.tenantId,
      input.assigned_staff_id,
      input.booth_id,
      input.workflow_template_id,
      input.loaner_car_id,
    );
    if (refErr) return apiValidationError(refErr);

    // 作成した店舗。Web の作成画面に店舗の選択は無いので、有効な店舗が
    // 1つだけならサーバが入れる（店舗で絞る画面から見えなくなるのを防ぐ）
    const store = await resolveStoreId(supabase, caller.tenantId, input.store_id);
    if (!store.ok) return apiValidationError(STORE_ERROR_MESSAGES[store.error]);

    // 終日予約は時刻を持たない（NULL 保存）。誤って時刻が送られても正規化する。
    const isAllDay = input.all_day === true;
    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      title: input.title,
      menu_items_json: input.menu_items_json ?? [],
      note: input.note,
      scheduled_date: input.scheduled_date,
      all_day: isAllDay,
      start_time: isAllDay ? null : input.start_time,
      end_time: isAllDay ? null : input.end_time,
      assigned_user_id: input.assigned_user_id,
      assigned_staff_id: input.assigned_staff_id,
      booth_id: input.booth_id,
      workflow_template_id: input.workflow_template_id,
      loaner_car_id: input.loaner_car_id,
      status: input.status,
      estimated_amount: input.estimated_amount ?? 0,
      store_id: store.storeId,
    };

    const { data: reservation, error } = await supabase
      .from("reservations")
      .insert(row)
      .select(
        "id, tenant_id, store_id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, all_day, start_time, end_time, assigned_user_id, assigned_staff_id, booth_id, status, estimated_amount, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "reservations insert");
    }

    // ── Google Calendar 同期（非ブロッキング） ──
    // レスポンス後も serverless runtime に処理を打ち切られないよう after() に登録する。
    // 各副作用は独立させ、1件の失敗で他の提案・同期まで止めない。
    after(async () => {
      const tasks = [
        syncCreateEvent(caller.tenantId, {
          id: reservation.id,
          title: reservation.title,
          scheduled_date: reservation.scheduled_date,
          start_time: reservation.start_time,
          end_time: reservation.end_time,
          note: reservation.note,
          customer_name: null,
          vehicle_label: null,
        }),
        maybeAutoCategorizeReservationOnIntake({
          tenantId: caller.tenantId,
          reservationId: reservation.id as string,
        }),
        maybeAutoProposeWorkflowForReservation({ tenantId: caller.tenantId, reservationId: reservation.id as string }),
        maybeAutoSuggestAssigneeForReservation({ tenantId: caller.tenantId, reservationId: reservation.id as string }),
      ];
      const results = await Promise.allSettled(tasks);
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.warn("reservation post-create task failed", {
            tenantId: caller.tenantId,
            reservationId: reservation.id,
            taskIndex: index,
            error: result.reason,
          });
        }
      });
    });

    return apiJson({ ok: true, reservation });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations create");
  }
}

// ─── PUT: 予約更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 担当者・ブース・ステータス等の更新は編集権限が必要（viewer は不可）。
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const rawBody = await req.json().catch(() => ({}));
    const parsed = reservationUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, cancel_reason, ...rest } = parsed.data;

    // 部分更新で「送っていないフィールド」を誤って null 上書きしないよう、
    // クライアントが実際に送ったキーだけを採用する。nullableUuid 等の transform は
    // 未指定フィールドも null 化するため、生ボディのキー集合で絞り込む必要がある。
    // (これが無いと例: ステータス前進や担当変更だけのリクエストで
    //  customer_id / vehicle_id / assigned_* / note が null に消えてしまう)
    const sentKeys = new Set(
      rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
    );
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && sentKeys.has(key)) updates[key] = value;
    }

    // 終日予約は時刻を持たない。all_day を true にする更新では start/end を NULL に正規化する
    // （フォームが空時刻を送ってきても、誤って時刻付き終日が保存されないようサーバ側で強制）。
    if (updates.all_day === true) {
      updates.start_time = null;
      updates.end_time = null;
    }

    // 送られた assigned_staff_id / booth_id はテナント所有を検証（クロステナント参照防止）
    const putRefErr = await validateReservationRefs(
      caller.tenantId,
      sentKeys.has("assigned_staff_id") ? (updates.assigned_staff_id as string | null) : undefined,
      sentKeys.has("booth_id") ? (updates.booth_id as string | null) : undefined,
      sentKeys.has("workflow_template_id") ? (updates.workflow_template_id as string | null) : undefined,
      sentKeys.has("loaner_car_id") ? (updates.loaner_car_id as string | null) : undefined,
    );
    if (putRefErr) return apiValidationError(putRefErr);

    // ワークフロー開始後の工程テンプレート変更を禁止する。
    // current_step_* / progress_pct / reservation_step_logs が旧テンプレのまま残り
    // 状態が不整合になるのを防ぐ（変更したい場合は先にワークフローを開始し直す運用）。
    if (sentKeys.has("workflow_template_id")) {
      const { data: cur } = await supabase
        .from("reservations")
        .select("workflow_template_id, current_step_key, current_step_order, progress_pct")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      const started =
        !!cur &&
        ((cur as { current_step_key: string | null }).current_step_key != null ||
          ((cur as { current_step_order: number | null }).current_step_order ?? 0) > 0 ||
          ((cur as { progress_pct: number | null }).progress_pct ?? 0) > 0);
      const changing =
        !!cur && (cur as { workflow_template_id: string | null }).workflow_template_id !== updates.workflow_template_id;
      if (started && changing) {
        return apiValidationError("ワークフロー開始後は工程テンプレートを変更できません。");
      }
    }

    // キャンセル時はタイムスタンプと理由を追記
    if (rest.status === "cancelled") {
      updates.cancelled_at = new Date().toISOString();
      updates.cancel_reason = cancel_reason ?? null;
    }

    // 作業タイマー: status 遷移で work_started_at / work_completed_at を自動セット。
    // 既に値が入っている場合は上書きしない (再進行で時刻が壊れるのを防ぐ)。
    // 列が無い環境では update が落ちるので、別取得で現在値を見て条件付きで含める。
    if (rest.status === "in_progress" || rest.status === "completed") {
      try {
        const { data: cur } = await supabase
          .from("reservations")
          .select("work_started_at, work_completed_at")
          .eq("id", id)
          .eq("tenant_id", caller.tenantId)
          .maybeSingle();
        const nowIso = new Date().toISOString();
        if (
          rest.status === "in_progress" &&
          cur &&
          (cur as { work_started_at: string | null }).work_started_at == null
        ) {
          updates.work_started_at = nowIso;
        }
        if (rest.status === "completed") {
          if (cur && (cur as { work_started_at: string | null }).work_started_at == null) {
            // 万一 in_progress を経ずに completed へ飛ぶケースは現時点を開始時刻として記録
            updates.work_started_at = nowIso;
          }
          if (cur && (cur as { work_completed_at: string | null }).work_completed_at == null) {
            updates.work_completed_at = nowIso;
          }
        }
      } catch {
        // 列が存在しない環境 (古いマイグレーション未適用) では timer を諦めて先に進む
      }
    }

    // 完了オートメーションは「実際の completed への遷移」だけを対象にする
    // (既に completed の予約を編集する PUT で再発火し、二重に下書きを作るのを防ぐ)。
    let priorStatus: string | null = null;
    if (rest.status === "completed") {
      const { data: prev } = await supabase
        .from("reservations")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      priorStatus = (prev?.status as string | null) ?? null;
    }

    const { data, error } = await supabase
      .from("reservations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, customer_id, vehicle_id, title, menu_items_json, note, scheduled_date, all_day, start_time, end_time, assigned_user_id, assigned_staff_id, booth_id, status, estimated_amount, gcal_event_id, cancelled_at, cancel_reason, work_started_at, work_completed_at, parts_replacement, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "reservations update");
    }

    // ── Google Calendar 同期（非ブロッキング） ──
    if (data.status === "cancelled" && data.gcal_event_id) {
      // キャンセル時は GCal イベントを削除
      syncDeleteEvent(caller.tenantId, data.id, data.gcal_event_id).catch((error) =>
        logger.warn("reservations gcal sync delete failed (non-blocking)", {
          error,
          tenantId: caller.tenantId,
          reservationId: data.id,
        }),
      );
    } else if (data.gcal_event_id) {
      // 既存イベントの更新
      syncUpdateEvent(caller.tenantId, {
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note,
        gcal_event_id: data.gcal_event_id,
      }).catch((error) =>
        logger.warn("reservations gcal sync update failed (non-blocking)", {
          error,
          tenantId: caller.tenantId,
          reservationId: data.id,
        }),
      );
    } else {
      // gcal_event_id がまだない場合は新規作成
      syncCreateEvent(caller.tenantId, {
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note,
      }).catch((error) =>
        logger.warn("reservations gcal sync create failed (non-blocking)", {
          error,
          tenantId: caller.tenantId,
          reservationId: data.id,
        }),
      );
    }

    // 部品交換トグル ON: 新規UIは作らず、バックエンドのみで作業前の最小限レコード
    // (part_installations, status=draft) を自動作成する。作業後の写真は証明書発行時に
    // 相乗りするため、ここでは写真もフォームも要求しない。冪等 (既存 draft があれば作らない・
    // DB のユニークインデックスでも保証)。レスポンスを遅らせないよう after() で実行する。
    if (sentKeys.has("parts_replacement") && updates.parts_replacement === true) {
      after(() =>
        createDraftPartInstallationForReservation({
          tenantId: caller.tenantId,
          reservationId: data.id,
          vehicleId: data.vehicle_id,
          customerId: data.customer_id,
          userId: caller.userId,
          partNameHint: data.title,
        }).catch((e) =>
          logger.warn("[reservations PUT] draft part installation auto-create failed", {
            reservationId: data.id,
            err: e instanceof Error ? e.message : String(e),
          }),
        ),
      );
    }

    // 案件完了時: 各種ドラフトを自動生成 (各自 opt-in のテナントのみ・発行/送付は必ず人 = 壁3)。
    // 「未完了 → completed」の実遷移時のみ発火する (既存 completed の編集では再発火しない)。
    // serverless でレスポンス後に打ち切られないよう after() で確実に完走させる。
    if (data.status === "completed" && priorStatus !== "completed") {
      after(async () => {
        // certificate.auto_draft: AI 下書きを reservations.ai_certificate_draft に保存。
        await maybeAutoDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: data.id });
        // certificate.auto_create_draft_record: 証明書を status=draft の行として起票。
        await maybeAutoCreateDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: data.id });
        // invoice.auto_draft_on_completion: 完了を請求のタイミングとして請求書を draft 起票。
        // ワークフロー請求工程を使わないテナント向け (会計工程の opt-in とは別)。冪等 (同顧客+
        // 車両の draft があれば作らない) なのでワークフロー側と二重起票しない。
        await maybeAutoCreateDraftInvoiceForReservation({
          tenantId: caller.tenantId,
          reservationId: data.id,
          trigger: "completion",
        });
      });
    }

    return apiJson({ ok: true, reservation: data });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations update");
  }
}

// ─── DELETE: 予約削除（キャンセル扱い） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 予約の削除は編集権限が必要（viewer は不可）。
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "reservation_delete",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = reservationDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    const hardDelete = body.hard_delete === true;

    if (hardDelete) {
      // 完全削除（キャンセル済み or 完了のみ許可）
      const { data: existing } = await supabase
        .from("reservations")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (!existing) return apiNotFound("not_found");
      if (existing.status !== "cancelled" && existing.status !== "completed") {
        return apiValidationError("active_reservation_cannot_delete");
      }

      // status フィルタを DELETE 側にもコピー (TOCTOU 防御)。
      // SELECT 〜 DELETE の間に他リクエストが status を active に戻した場合、
      // ここで in() に外れて 0 行削除になり、誤って稼働中の予約を消すのを防ぐ。
      const { data: deleted, error: delErr } = await supabase
        .from("reservations")
        .delete()
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .in("status", ["cancelled", "completed"])
        .select("id");

      if (delErr) {
        return apiInternalError(delErr, "reservations hard_delete");
      }
      if (!deleted || deleted.length === 0) {
        return apiValidationError("active_reservation_cannot_delete");
      }
      return apiJson({ ok: true, deleted: true });
    }

    // ソフトデリート（キャンセル扱い）
    const cancelReason = String(body?.cancel_reason ?? "").trim() || null;

    // キャンセル前に gcal_event_id を取得
    const { data: existing } = await supabase
      .from("reservations")
      .select("gcal_event_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    const { data, error } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, customer_id, vehicle_id, title, status, cancelled_at, cancel_reason, gcal_event_id, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "reservations cancel");
    }

    // ── Google Calendar 同期: イベント削除（非ブロッキング） ──
    if (existing?.gcal_event_id) {
      syncDeleteEvent(caller.tenantId, id, existing.gcal_event_id).catch((error) =>
        logger.warn("reservations gcal sync delete failed (non-blocking)", {
          error,
          tenantId: caller.tenantId,
          reservationId: id,
        }),
      );
    }

    return apiJson({ ok: true, reservation: data });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations cancel");
  }
}
