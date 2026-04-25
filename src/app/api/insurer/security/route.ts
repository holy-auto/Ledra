import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { insurerSecurityUpdateSchema } from "@/lib/validations/insurer";

export const runtime = "nodejs";

/**
 * insurer_security_settings table structure:
 * - id uuid PK
 * - insurer_id uuid FK UNIQUE
 * - ip_whitelist_enabled boolean default false
 * - ip_whitelist text[] (array of IP/CIDR strings)
 * - session_timeout_minutes integer default 30
 * - updated_at timestamptz
 * - updated_by uuid FK
 */

const DEFAULT_SETTINGS = {
  ip_whitelist_enabled: false,
  ip_whitelist: [] as string[],
  session_timeout_minutes: 30,
};

/**
 * GET /api/insurer/security
 * Fetch security settings for the current insurer. Admin only.
 */
export async function GET() {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("管理者のみセキュリティ設定を表示できます。");

  try {
    const { admin } = createInsurerScopedAdmin(caller.insurerId);

    const { data, error } = await admin
      .from("insurer_security_settings")
      .select("id, ip_whitelist_enabled, ip_whitelist, session_timeout_minutes, updated_at")
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (error) {
      // Table may not exist yet — return defaults
      console.warn("[security settings] query error, returning defaults:", error.message);
      return apiJson({ settings: DEFAULT_SETTINGS });
    }

    if (!data) {
      return apiJson({ settings: DEFAULT_SETTINGS });
    }

    return apiJson({ settings: data });
  } catch (e) {
    // Gracefully handle missing table
    console.warn("[security settings] exception, returning defaults:", e);
    return apiJson({ settings: DEFAULT_SETTINGS });
  }
}

/**
 * PATCH /api/insurer/security
 * Update security settings. Admin only.
 * Body: { ip_whitelist_enabled?, ip_whitelist?, session_timeout_minutes? }
 */
export async function PATCH(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("管理者のみセキュリティ設定を変更できます。");

  const parsed = insurerSecurityUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { ip_whitelist_enabled, ip_whitelist, session_timeout_minutes } = parsed.data;

  try {
    const { admin } = createInsurerScopedAdmin(caller.insurerId);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: caller.userId,
    };
    if (ip_whitelist_enabled !== undefined) {
      updates.ip_whitelist_enabled = !!ip_whitelist_enabled;
    }
    if (ip_whitelist !== undefined) {
      updates.ip_whitelist = ip_whitelist;
    }
    if (session_timeout_minutes !== undefined) {
      updates.session_timeout_minutes = session_timeout_minutes;
    }

    // Upsert: try update first, then insert if not found
    const { data: existing } = await admin
      .from("insurer_security_settings")
      .select("id")
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    let result;
    if (existing) {
      result = await admin
        .from("insurer_security_settings")
        .update(updates)
        .eq("insurer_id", caller.insurerId)
        .select("id, ip_whitelist_enabled, ip_whitelist, session_timeout_minutes, updated_at")
        .single();
    } else {
      result = await admin
        .from("insurer_security_settings")
        .insert({
          insurer_id: caller.insurerId,
          ...DEFAULT_SETTINGS,
          ...updates,
        })
        .select("id, ip_whitelist_enabled, ip_whitelist, session_timeout_minutes, updated_at")
        .single();
    }

    if (result.error) {
      // Table may not exist
      console.warn("[security settings] upsert error:", result.error.message);
      return apiInternalError(result.error, "security settings update");
    }

    return apiJson({ ok: true, settings: result.data });
  } catch (e) {
    return apiInternalError(e, "security settings update");
  }
}
