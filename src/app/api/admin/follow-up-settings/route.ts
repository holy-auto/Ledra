import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

/**
 * 施工種別ごとのメンテナンス月数 override の zod スキーマ。
 * キーは小文字英数 + アンダースコアのみ許可 (DB 側に流す前のサニタイズ)。
 */
const maintenanceScheduleByServiceSchema = z
  .record(z.string().regex(/^[a-z0-9_]+$/), z.array(z.coerce.number().int().min(1).max(120)).max(10))
  .default({});

const followUpSettingsSchema = z.object({
  reminder_days_before: z.array(z.coerce.number().int().positive()).max(10).default([30, 7, 1]),
  follow_up_days_after: z.array(z.coerce.number().int().positive()).max(10).default([90, 180]),
  enabled: z.boolean().default(true),
  maintenance_reminder_months: z.array(z.coerce.number().int().min(1).max(120)).max(10).default([6, 12]),
  maintenance_schedule_by_service: maintenanceScheduleByServiceSchema,
  // 季節提案 (10-11月: 冬前 / 5-6月: 梅雨前)。DB の seasonal_enabled に対応。
  seasonal_enabled: z.boolean().default(false),
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
      .select(
        "reminder_days_before, follow_up_days_after, enabled, maintenance_reminder_months, maintenance_schedule_by_service, seasonal_enabled",
      )
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    return apiJson({
      settings: data ?? {
        reminder_days_before: [30, 7, 1],
        follow_up_days_after: [90, 180],
        enabled: true,
        maintenance_reminder_months: [6, 12],
        maintenance_schedule_by_service: {},
        seasonal_enabled: false,
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

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "follow-up-settings");
  }
}
