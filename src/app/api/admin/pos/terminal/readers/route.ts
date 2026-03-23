import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

// ─── GET: Stripe Terminal リーダー一覧取得 ───
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireMinRole(caller, "staff")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const list = await stripe.terminal.readers.list({ limit: 100 });

    // テナントごとにフィルタ（metadata.tenant_id が設定されている場合）
    const readers = list.data
      .filter((r) => {
        const meta = r.metadata ?? {};
        // metadata にtenant_idが未設定のリーダーも含める（共有リーダー対応）
        return !meta.tenant_id || meta.tenant_id === caller.tenantId;
      })
      .map((r) => ({
        id: r.id,
        label: r.label ?? r.id,
        status: r.status,
        device_type: r.device_type,
        location: r.location ?? null,
      }));

    return NextResponse.json({ readers });
  } catch (e: unknown) {
    console.error("[pos/terminal/readers] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
