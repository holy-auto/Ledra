import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

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

    const body = await req.json();
    const question = String(body?.question ?? "").trim();
    const answer = String(body?.answer ?? "").trim();

    if (!question || !answer) {
      return apiValidationError("question and answer required");
    }

    const { data, error } = await supabase
      .from("support_faq")
      .insert({ question, answer, sort_order: body?.sort_order ?? 0 })
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

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    await supabase.from("support_faq").delete().eq("id", id);
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "faq DELETE");
  }
}
