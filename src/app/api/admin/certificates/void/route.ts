import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const publicId = (body?.public_id ?? "").trim();

    if (!publicId) {
      return NextResponse.json({ error: "missing public_id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userRes.user.id)
      .limit(1)
      .single();

    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no_tenant" }, { status: 400 });
    }

    // tenant_id で絞ることで他テナントの証明書は操作不可
    const existing = await supabase
      .from("certificates")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId)
      .limit(1)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (String(existing.data.status ?? "").toLowerCase() === "void") {
      return NextResponse.json({ ok: true, already_void: true });
    }

    const { error: updateErr } = await supabase
      .from("certificates")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("public_id", publicId);

    if (updateErr) {
      return NextResponse.json({ error: "update_failed", detail: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("certificate void failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
