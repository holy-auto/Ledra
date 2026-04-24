import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// GET: フォロー設定取得
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data } = await supabase
      .from("follow_up_settings")
      .select("reminder_days_before, follow_up_days_after, enabled")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    return NextResponse.json({
      settings: data ?? {
        reminder_days_before: [30, 7, 1],
        follow_up_days_after: [90, 180],
        enabled: true,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "follow-up-settings");
  }
}

// PUT: フォロー設定更新
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const reminderDays = Array.isArray(body.reminder_days_before)
      ? body.reminder_days_before.filter((n: number) => typeof n === "number" && n > 0)
      : [30, 7, 1];
    const followUpDays = Array.isArray(body.follow_up_days_after)
      ? body.follow_up_days_after.filter((n: number) => typeof n === "number" && n > 0)
      : [90, 180];
    const enabled = body.enabled !== false;

    const row = {
      tenant_id: caller.tenantId,
      reminder_days_before: reminderDays,
      follow_up_days_after: followUpDays,
      enabled,
      updated_at: new Date().toISOString(),
    };

    // Upsert
    const { data: existing } = await supabase
      .from("follow_up_settings")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (existing) {
      await supabase.from("follow_up_settings").update(row).eq("tenant_id", caller.tenantId);
    } else {
      await supabase.from("follow_up_settings").insert({ ...row, id: crypto.randomUUID() });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "follow-up-settings");
  }
}
