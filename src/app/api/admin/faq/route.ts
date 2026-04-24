import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { faqCreateSchema, faqDeleteSchema } from "@/lib/validations/faq";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/faq — FAQ一覧取得
 * POST /api/admin/faq — FAQ追加（運営のみ）
 * PUT /api/admin/faq — FAQ更新（運営のみ）
 * DELETE /api/admin/faq — FAQ削除（運営のみ）
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("support_faq")
      .select("id, question, answer, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      // テーブル未作成時は空を返す
      return apiJson({ items: [] });
    }

    const items = (data ?? []).map((r) => ({
      id: r.id,
      q: r.question,
      a: r.answer,
    }));

    return apiJson({ items });
  } catch {
    return apiJson({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) {
      return apiForbidden();
    }

    const parsed = faqCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data, error } = await supabase
      .from("support_faq")
      .insert(parsed.data)
      .select("id, question, answer, sort_order, created_at")
      .single();

    if (error) return apiInternalError(error, "faq POST");
    return apiJson({ ok: true, item: data });
  } catch (e) {
    return apiInternalError(e, "faq POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "settings:edit")) {
      return apiForbidden();
    }

    const parsed = faqDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    await supabase.from("support_faq").delete().eq("id", parsed.data.id);
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "faq DELETE");
  }
}
