import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";

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
      return NextResponse.json({ items: [] });
    }

    const items = (data ?? []).map((r) => ({
      id: r.id,
      q: r.question,
      a: r.answer,
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "settings:edit")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const question = String(body?.question ?? "").trim();
    const answer = String(body?.answer ?? "").trim();

    if (!question || !answer) {
      return NextResponse.json({ error: "question and answer required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("support_faq")
      .insert({ question, answer, sort_order: body?.sort_order ?? 0 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requirePermission(caller, "settings:edit")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    await supabase.from("support_faq").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
