import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { sendLineBroadcast, type BroadcastRecipient } from "@/lib/line/broadcast";
import { segmentSchema, type LineBroadcastSegment } from "@/lib/validations/line-broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createTenantScopedAdmin>["admin"];

/**
 * POST /api/admin/line-broadcasts/[id]/send
 *
 * 配信を即時実行する。
 *  1. 配信を取得し、テナント所属 + status (draft / scheduled) を検証。
 *  2. status を 'sending' へ原子的に遷移 (二重送信ガード)。
 *  3. segment_json から受信者 (line_user_id を持つ顧客) を解決。
 *  4. sendLineBroadcast で push し、件数を集計。
 *  5. 配信結果で status='sent' (または 1 件も送れず failed) に更新。
 *
 * 注意: customers.last_visit_date 列は存在しないため、segment_type
 * "no_visit_days" の絞り込みは無効化し「line_user_id を持つ全顧客」に
 * フォールバックする (DB スキーマ追加後に対応予定)。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("broadcast id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) 配信を取得 (テナントスコープ)。
    const { data: broadcast, error: fetchErr } = await admin
      .from("line_broadcasts")
      .select("id, status, message_text, segment_json")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "line-broadcasts send fetch");
    if (!broadcast) return apiNotFound("配信が見つかりません。");

    if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
      return apiValidationError("下書き・予約済みの配信のみ送信できます。");
    }

    // segment_json を検証 (不正なら all にフォールバック)。
    const segParsed = segmentSchema.safeParse(broadcast.segment_json);
    const segment: LineBroadcastSegment = segParsed.success ? segParsed.data : { segment_type: "all" };

    // 2) status を 'sending' へ原子的に遷移する (二重送信ガード)。
    //    現在 status が draft/scheduled のときだけ更新が成立する。
    const { data: claimed, error: claimErr } = await admin
      .from("line_broadcasts")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .in("status", ["draft", "scheduled"])
      .select("id")
      .maybeSingle();
    if (claimErr) return apiInternalError(claimErr, "line-broadcasts send claim");
    if (!claimed) {
      // 別リクエストが先に sending へ遷移させた等。
      return apiValidationError("この配信は既に処理中または送信済みです。");
    }

    // 3) 受信者を解決する。失敗時は status を draft に戻して再試行可能にする。
    let recipients: BroadcastRecipient[];
    try {
      recipients = await resolveRecipients(admin, caller.tenantId, segment);
    } catch (e) {
      await admin
        .from("line_broadcasts")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
      return apiInternalError(e, "line-broadcasts send resolveRecipients");
    }

    // 4) 一斉送信。
    const result = await sendLineBroadcast({
      tenantId: caller.tenantId,
      body: broadcast.message_text as string,
      recipients,
      sentByUserId: caller.userId,
    });

    // LINE 未設定なら status を draft に戻し、設定を促す。
    if (result.notConfigured) {
      await admin
        .from("line_broadcasts")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
      return apiValidationError("このテナントは LINE 連携が未設定です。設定後に再度お試しください。");
    }

    // 5) 配信結果を反映する。対象が居て全て失敗なら failed、それ以外は sent。
    const finalStatus = result.targetCount > 0 && result.sentCount === 0 ? "failed" : "sent";
    const { error: updateErr } = await admin
      .from("line_broadcasts")
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        target_count: result.targetCount,
        sent_count: result.sentCount,
        failed_count: result.failedCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (updateErr) return apiInternalError(updateErr, "line-broadcasts send finalize");

    return apiJson({
      ok: true,
      sent_count: result.sentCount,
      failed_count: result.failedCount,
      target_count: result.targetCount,
    });
  } catch (e) {
    return apiInternalError(e, "line-broadcasts send");
  }
}

/**
 * segment_json に従って受信者 (line_user_id を持つ顧客) を解決する。
 *
 * - all          : line_user_id を持つ全顧客
 * - no_visit_days : customers.last_visit_date 列が無いため無効化し all と同等に
 *                   フォールバック (列追加後に有効化予定)。
 * - vehicle_type  : 指定メーカーの車両を持つ顧客に絞る (vehicles を join)。
 *
 * いずれも line_user_id IS NOT NULL を必須とし、重複 line_user_id は排除する。
 */
async function resolveRecipients(
  admin: AdminClient,
  tenantId: string,
  segment: LineBroadcastSegment,
): Promise<BroadcastRecipient[]> {
  // vehicle_type: 指定メーカーの車両を持つ顧客 customer_id を先に集める。
  let customerIdFilter: string[] | null = null;
  if (segment.segment_type === "vehicle_type") {
    const { data: vehicles, error } = await admin
      .from("vehicles")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .ilike("maker", segment.filters.maker)
      .not("customer_id", "is", null);
    if (error) throw error;
    const ids = [...new Set((vehicles ?? []).map((v) => v.customer_id).filter(Boolean))] as string[];
    if (ids.length === 0) return [];
    customerIdFilter = ids;
  }

  let query = admin
    .from("customers")
    .select("id, line_user_id")
    .eq("tenant_id", tenantId)
    .not("line_user_id", "is", null);

  if (customerIdFilter) {
    query = query.in("id", customerIdFilter);
  }

  const { data: customers, error } = await query;
  if (error) throw error;

  // line_user_id の重複を排除 (1 ユーザに 1 通)。
  const seen = new Set<string>();
  const recipients: BroadcastRecipient[] = [];
  for (const c of customers ?? []) {
    const lineUserId = c.line_user_id as string | null;
    if (!lineUserId || seen.has(lineUserId)) continue;
    seen.add(lineUserId);
    recipients.push({ lineUserId, customerId: c.id as string });
  }
  return recipients;
}
