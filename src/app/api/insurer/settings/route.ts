import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * insurer_user_preferences table structure:
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK references insurers(id)
 * - user_id uuid FK references auth.users(id)
 * - notification_prefs jsonb default '{}'
 * - created_at timestamptz default now()
 * - updated_at timestamptz default now()
 *
 * notification_prefs JSON shape:
 * {
 *   case_update: boolean,     // 案件ステータス変更
 *   pii_decision: boolean,    // PII開示承認/却下
 *   new_message: boolean,     // 新規メッセージ
 *   sla_alert: boolean,       // SLA期限超過アラート
 * }
 */

const DEFAULT_PREFS = {
  case_update: true,
  pii_decision: true,
  new_message: true,
  sla_alert: true,
};

/**
 * GET /api/insurer/settings
 * Fetch the current user's notification preferences.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_user_preferences")
      .select("notification_prefs")
      .eq("insurer_id", caller.insurerId)
      .eq("user_id", caller.userId)
      .maybeSingle();

    if (error) {
      // Table may not exist yet — return defaults
      if (error.message.includes("does not exist") || error.code === "42P01") {
        return apiJson({ preferences: DEFAULT_PREFS });
      }
      return apiInternalError(error, "insurer.settings");
    }

    const prefs = data?.notification_prefs ?? DEFAULT_PREFS;

    return apiJson({
      preferences: { ...DEFAULT_PREFS, ...prefs },
    });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/settings");
  }
}

/**
 * PATCH /api/insurer/settings
 * Update notification preferences.
 * Body: { preferences: { case_update?: boolean, pii_decision?: boolean, ... } }
 */
export async function PATCH(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON body.");
  }

  const { preferences } = body as {
    preferences?: Record<string, boolean>;
  };

  if (!preferences || typeof preferences !== "object") {
    return apiValidationError("preferences object is required.");
  }

  // Validate keys — only allow known preference keys
  const allowedKeys = new Set(["case_update", "pii_decision", "new_message", "sla_alert"]);
  const sanitized: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(preferences)) {
    if (allowedKeys.has(key) && typeof val === "boolean") {
      sanitized[key] = val;
    }
  }

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Try upsert — if user_id + insurer_id row exists, merge prefs
    const { data: existing, error: fetchErr } = await admin
      .from("insurer_user_preferences")
      .select("id, notification_prefs")
      .eq("insurer_id", caller.insurerId)
      .eq("user_id", caller.userId)
      .maybeSingle();

    if (fetchErr) {
      // Table may not exist yet
      if (fetchErr.message.includes("does not exist") || fetchErr.code === "42P01") {
        return apiJson({
          ok: true,
          preferences: { ...DEFAULT_PREFS, ...sanitized },
          _note: "Table does not exist yet. Preferences saved in-memory only.",
        });
      }
      return apiValidationError(fetchErr.message);
    }

    const mergedPrefs = {
      ...DEFAULT_PREFS,
      ...(existing?.notification_prefs ?? {}),
      ...sanitized,
    };

    if (existing) {
      const { error: updateErr } = await admin
        .from("insurer_user_preferences")
        .update({
          notification_prefs: mergedPrefs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) return apiValidationError(updateErr.message);
    } else {
      const { error: insertErr } = await admin.from("insurer_user_preferences").insert({
        insurer_id: caller.insurerId,
        user_id: caller.userId,
        notification_prefs: mergedPrefs,
      });

      if (insertErr) return apiValidationError(insertErr.message);
    }

    return apiJson({ ok: true, preferences: mergedPrefs });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/settings");
  }
}
