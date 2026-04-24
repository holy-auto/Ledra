import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

const followUpSettingsSchema = z.object({
  reminder_days_before: z.array(z.coerce.number().int().positive()).max(10).default([30, 7, 1]),
  follow_up_days_after: z.array(z.coerce.number().int().positive()).max(10).default([90, 180]),
  enabled: z.boolean().default(true),
});

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

    const parsed = followUpSettingsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row = {
      tenant_id: caller.tenantId,
      ...parsed.data,
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
