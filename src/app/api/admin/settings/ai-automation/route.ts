/**
 * GET  — current AI automation policy for the caller's tenant.
 * PUT  — replace the policy (owner / admin only).
 *
 * Reads gracefully degrade to catalog defaults when the migration has not
 * been applied yet so preview deploys never crash the settings UI.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { logAiAuditEvent } from "@/lib/audit/aiAuditLog";
import {
  isFieldPolicy,
  isKnownFieldKey,
  isKnownSourceKey,
} from "@/lib/ai/automation/fieldCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const settings = await loadAiAutomationSettings(caller.tenantId);
    return apiOk({
      settings: {
        enabled: settings.enabled,
        fieldPolicies: settings.fieldPolicies,
        confidenceThreshold: settings.confidenceThreshold,
        sourcePolicies: settings.sourcePolicies,
      },
      loadedFromDb: settings.loadedFromDb,
      role: caller.role,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "ai-automation GET");
  }
}

const fieldPolicyValue = z.enum(["auto", "suggest", "manual"]);

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  fieldPolicies: z.record(z.string(), fieldPolicyValue).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  sourcePolicies: z.record(z.string(), z.boolean()).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("AI 自動入力の設定は管理者のみ変更できます。");
    }

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const current = await loadAiAutomationSettings(tenantId);

    // Sanitize: unknown keys are silently dropped so future catalog removals
    // never lock anyone out of the settings page.
    const cleanedFieldPolicies = sanitizePersistedFieldPolicies(parsed.data.fieldPolicies ?? current.fieldPolicies);
    const cleanedSourcePolicies = sanitizePersistedSourcePolicies(parsed.data.sourcePolicies ?? current.sourcePolicies);

    const nextEnabled = parsed.data.enabled ?? current.enabled;
    const nextThreshold = parsed.data.confidenceThreshold ?? current.confidenceThreshold;

    const { error } = await admin.from("tenant_ai_automation_settings").upsert(
      {
        tenant_id: tenantId,
        enabled: nextEnabled,
        field_policies: cleanedFieldPolicies,
        confidence_threshold: nextThreshold,
        source_policies: cleanedSourcePolicies,
        updated_by: caller.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      // Soft-fail if the migration has not yet been applied — return the
      // posted state as if it were saved so the UI does not block.
      const msg = error.message?.toLowerCase() ?? "";
      if (error.code === "42P01" || error.code === "PGRST205" || msg.includes("does not exist")) {
        return apiOk({
          settings: {
            enabled: nextEnabled,
            fieldPolicies: cleanedFieldPolicies,
            confidenceThreshold: nextThreshold,
            sourcePolicies: cleanedSourcePolicies,
          },
          persisted: false,
          warning: "AI 自動入力設定テーブルがまだ未作成です。マイグレーションを適用すると保存されるようになります。",
        });
      }
      return apiInternalError(error, "ai-automation PUT upsert");
    }

    // 監査ログ: 変更があった項目だけ detail に残す (fire-and-forget)
    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: diffSettings(current, {
        enabled: nextEnabled,
        fieldPolicies: cleanedFieldPolicies,
        confidenceThreshold: nextThreshold,
        sourcePolicies: cleanedSourcePolicies,
      }),
    });

    return apiOk({
      settings: {
        enabled: nextEnabled,
        fieldPolicies: cleanedFieldPolicies,
        confidenceThreshold: nextThreshold,
        sourcePolicies: cleanedSourcePolicies,
      },
      persisted: true,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "ai-automation PUT");
  }
}

function diffSettings(
  before: {
    enabled: boolean;
    fieldPolicies: Record<string, string>;
    confidenceThreshold: number;
    sourcePolicies: Record<string, boolean>;
  },
  after: {
    enabled: boolean;
    fieldPolicies: Record<string, string>;
    confidenceThreshold: number;
    sourcePolicies: Record<string, boolean>;
  },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (before.enabled !== after.enabled) out.enabled = { from: before.enabled, to: after.enabled };
  if (before.confidenceThreshold !== after.confidenceThreshold) {
    out.confidenceThreshold = { from: before.confidenceThreshold, to: after.confidenceThreshold };
  }
  const fieldChanges: Record<string, { from: string | null; to: string }> = {};
  const allFieldKeys = new Set([...Object.keys(before.fieldPolicies), ...Object.keys(after.fieldPolicies)]);
  for (const k of allFieldKeys) {
    const b = before.fieldPolicies[k] ?? null;
    const a = after.fieldPolicies[k];
    if (a && b !== a) fieldChanges[k] = { from: b, to: a };
    else if (!a && b) fieldChanges[k] = { from: b, to: "(unset)" };
  }
  if (Object.keys(fieldChanges).length > 0) out.fieldPolicies = fieldChanges;
  const sourceChanges: Record<string, { from: boolean | null; to: boolean }> = {};
  const allSourceKeys = new Set([...Object.keys(before.sourcePolicies), ...Object.keys(after.sourcePolicies)]);
  for (const k of allSourceKeys) {
    const b = before.sourcePolicies[k] ?? null;
    const a = after.sourcePolicies[k];
    if (a !== undefined && b !== a) sourceChanges[k] = { from: b, to: a };
  }
  if (Object.keys(sourceChanges).length > 0) out.sourcePolicies = sourceChanges;
  return out;
}

function sanitizePersistedFieldPolicies(input: Record<string, unknown> | undefined) {
  const out: Record<string, "auto" | "suggest" | "manual"> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (!isKnownFieldKey(k)) continue;
    if (!isFieldPolicy(v)) continue;
    out[k] = v;
  }
  return out;
}

function sanitizePersistedSourcePolicies(input: Record<string, unknown> | undefined) {
  const out: Record<string, boolean> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (!isKnownSourceKey(k)) continue;
    if (typeof v !== "boolean") continue;
    out[k] = v;
  }
  return out;
}
