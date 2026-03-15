import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const publicId = (body?.public_id ?? "").trim();

    if (!publicId) {
      return NextResponse.json({ error: "missing public_id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireMinRole(caller, "admin")) {
      return NextResponse.json({ error: "forbidden", message: "証明書無効化の権限がありません。" }, { status: 403 });
    }

    const userRes = { user: { id: caller.userId } };
    const tenantId = caller.tenantId;

    // tenant_id で絞ることで他テナントの証明書は操作不可
    const existing = await supabase
      .from("certificates")
      .select("id, vehicle_id, status")
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

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    logCertificateAction({
      type: "certificate_voided",
      tenantId,
      publicId,
      certificateId: existing.data.id,
      vehicleId: existing.data.vehicle_id ?? null,
      userId: userRes.user.id,
      description: `証明書を無効化 (void)`,
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("certificate void failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
