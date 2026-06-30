/**
 * POST /api/admin/customer-messages/[id]/candidate-dismiss
 *
 * inbound メッセージに付いた AI 予約候補 (customer_messages.ai_extracted) を
 * 「対応済み」にする。受信箱の予定候補バッジ・顧客画面の候補カードを収束させ、
 * 既に予約化した / 不要と判断した候補がいつまでも残らないようにする。
 *
 * ai_extracted jsonb に handled_at を立てるだけ (read-modify-write)。
 * body: { handled?: boolean }  // 既定 true。false で取り消し (再表示) も可能。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const schema = z.object({ handled: z.boolean().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("message id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const handled = schema.safeParse(await req.json().catch(() => ({}))).data?.handled ?? true;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: message, error: mErr } = await admin
      .from("customer_messages")
      .select("id, ai_extracted")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mErr) return apiInternalError(mErr, "candidate-dismiss: load");
    if (!message) return apiNotFound("message not found");

    const current = (message.ai_extracted as Record<string, unknown> | null) ?? null;
    if (!current) return apiNotFound("no AI candidate on this message");

    const next = { ...current, handled_at: handled ? new Date().toISOString() : null };
    const { error: upErr } = await admin
      .from("customer_messages")
      .update({ ai_extracted: next })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (upErr) return apiInternalError(upErr, "candidate-dismiss: update");

    return apiOk({ ok: true, handled_at: next.handled_at });
  } catch (e) {
    return apiInternalError(e, "candidate-dismiss");
  }
}
