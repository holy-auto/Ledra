import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { insurerCaseMessageSchema } from "@/lib/validations/insurer-case";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 案件が呼び出し元テナントに属するか検証する。tenant_id フィルタをクエリ自体に
 * 焼き込むため、他テナント/他保険会社の案件は決して返さない。
 */
async function verifyTenantCase(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  caseId: string,
  tenantId: string,
) {
  const { data, error } = await admin
    .from("insurer_cases")
    .select("id, tenant_id, insurer_id, status, case_number, title, assigned_to")
    .eq("id", caseId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return apiInternalError(error, "admin/insurer-cases/[id]/messages verify");
  if (!data) return apiNotFound("保険案件が見つかりません。");
  return data;
}

/**
 * GET /api/admin/insurer-cases/[id]/messages
 * 施工店が紐づく保険案件のメッセージ往復を取得する。表示は sender_type で
 * 区別すれば足りるため個人名の解決は行わない (insurer/tenant/system)。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await ctx.params;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const verified = await verifyTenantCase(admin, id, caller.tenantId);
    if (verified instanceof Response) return verified;

    const { data: messages, error } = await admin
      .from("insurer_case_messages")
      .select("id, case_id, sender_type, content, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "admin/insurer-cases/[id]/messages GET");

    return apiJson(
      { case: verified, messages: messages ?? [] },
      { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=20" } },
    );
  } catch (e) {
    return apiInternalError(e, "admin/insurer-cases/[id]/messages GET");
  }
}

/**
 * POST /api/admin/insurer-cases/[id]/messages
 * 施工店から保険会社へメッセージを送る。sender_type は API 側で 'tenant' に固定する。
 * 保険会社からの返答待ち (pending_tenant) だった案件は in_progress に進める。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await ctx.params;

    const parsed = insurerCaseMessageSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { content } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const verified = await verifyTenantCase(admin, id, caller.tenantId);
    if (verified instanceof Response) return verified;

    const { data: message, error } = await admin
      .from("insurer_case_messages")
      .insert({
        case_id: id,
        sender_id: caller.userId,
        sender_type: "tenant", // client 指定は無視して常に tenant 固定
        content,
      })
      .select("id, case_id, sender_type, content, created_at")
      .single();
    if (error) return apiInternalError(error, "admin/insurer-cases/[id]/messages POST");

    // 保険会社からの返答待ちだった案件は「処理中」に戻す (施工店が返答した)。
    // status='pending_tenant' を WHERE 条件に含めて compare-and-swap にすることで、
    // 同時に複数の返信が来ても遷移を実行する (＝webhookを発火する) のは1件だけになる。
    if ((verified as { status?: string }).status === "pending_tenant") {
      const now = new Date().toISOString();
      const { data: transitioned } = await admin
        .from("insurer_cases")
        .update({ status: "in_progress", updated_at: now })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .eq("status", "pending_tenant")
        .select("id");

      if (transitioned && transitioned.length > 0) {
        // 基幹ソフト連携向け webhook (購読が無ければ no-op)。after() で確実に実行する。
        after(async () => {
          await emitEntityWebhook(caller.tenantId, "insurer_case.status_changed", id, {
            case_id: id,
            case_number: (verified as { case_number?: string }).case_number ?? null,
            title: (verified as { title?: string }).title ?? null,
            old_status: "pending_tenant",
            new_status: "in_progress",
            insurer_id: (verified as { insurer_id?: string | null }).insurer_id ?? null,
            updated_at: now,
          });
        });
      }
    }

    // 保険会社の担当者へ通知 (fire-and-forget)。テーブル未整備の環境では握りつぶす。
    const assignedTo = (verified as { assigned_to?: string | null }).assigned_to ?? null;
    const insurerId = (verified as { insurer_id?: string | null }).insurer_id ?? null;
    if (assignedTo && insurerId) {
      void admin
        .from("insurer_notifications")
        .insert({
          insurer_id: insurerId,
          user_id: assignedTo,
          type: "new_message",
          title: "施工店から新しいメッセージ",
          body: `案件 ${(verified as { case_number?: string }).case_number ?? id}: ${content.slice(0, 100)}`,
          link: `/insurer/cases/${id}`,
        })
        .then(({ error: nErr }) => {
          if (nErr) console.warn("[insurer-notification] insert skipped:", nErr.message);
        });
    }

    return apiJson({ message }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "admin/insurer-cases/[id]/messages POST");
  }
}
