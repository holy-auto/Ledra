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
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiPlanLimit } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { logAiAuditEvent } from "@/lib/audit/aiAuditLog";
import { isFieldPolicy, isKnownFieldKey, isKnownSourceKey } from "@/lib/ai/automation/fieldCatalog";
import { sanitizeAutoActions } from "@/lib/ai/automation/actionCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // 設定画面は「設定値そのもの」を見せるため、コストキャップ超過で enabled を
    // 倒さない (applyCostCap:false)。現況は costCap で別途返す。
    const settings = await loadAiAutomationSettings(caller.tenantId, { applyCostCap: false });
    return apiOk({
      settings: {
        enabled: settings.enabled,
        fieldPolicies: settings.fieldPolicies,
        confidenceThreshold: settings.confidenceThreshold,
        sourcePolicies: settings.sourcePolicies,
        autoActions: settings.autoActions,
        monthlyCostCapJpy: settings.monthlyCostCapJpy,
      },
      costCap: settings.costCap ?? null,
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
  autoActions: z.record(z.string(), z.boolean()).optional(),
  /** AI 月次コスト上限 (円)。0 / null = テナント個別上限なし (env 既定に従う)。 */
  monthlyCostCapJpy: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

/** auto_actions 列だけ未作成 (部分マイグレーション) の検出。 */
function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204";
}

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
    const current = await loadAiAutomationSettings(tenantId, { applyCostCap: false });

    // Sanitize: unknown keys are silently dropped so future catalog removals
    // never lock anyone out of the settings page.
    const cleanedFieldPolicies = sanitizePersistedFieldPolicies(parsed.data.fieldPolicies ?? current.fieldPolicies);
    const cleanedSourcePolicies = sanitizePersistedSourcePolicies(parsed.data.sourcePolicies ?? current.sourcePolicies);
    // 壁3 アクションは sanitizeAutoActions が常に弾く (true でも永続化されない)。
    const cleanedAutoActions =
      parsed.data.autoActions !== undefined
        ? sanitizeAutoActions(parsed.data.autoActions)
        : sanitizeAutoActions(current.autoActions);

    const nextEnabled = parsed.data.enabled ?? current.enabled;
    const nextThreshold = parsed.data.confidenceThreshold ?? current.confidenceThreshold;
    // 0 / null は「個別上限なし」として null 永続化する。
    const nextCostCap =
      parsed.data.monthlyCostCapJpy === undefined
        ? current.monthlyCostCapJpy
        : parsed.data.monthlyCostCapJpy && parsed.data.monthlyCostCapJpy > 0
          ? parsed.data.monthlyCostCapJpy
          : null;

    // この PUT で新たに auto-action を有効化する場合のみ、プランを判定する
    // (他設定だけの編集はプランで縛らない)。
    if (parsed.data.autoActions !== undefined && Object.keys(cleanedAutoActions).length > 0) {
      if (!canUseFeature(caller.planTier, "ai_inbound_extract")) {
        return apiPlanLimit("AI 自動アクションは Standard プラン以上でご利用いただけます。");
      }
    }

    const baseRow = {
      tenant_id: tenantId,
      enabled: nextEnabled,
      field_policies: cleanedFieldPolicies,
      confidence_threshold: nextThreshold,
      source_policies: cleanedSourcePolicies,
      updated_by: caller.userId,
      updated_at: new Date().toISOString(),
    };

    let autoActionsPersisted = true;
    let { error } = await admin
      .from("tenant_ai_automation_settings")
      .upsert(
        { ...baseRow, auto_actions: cleanedAutoActions, monthly_cost_cap_jpy: nextCostCap },
        { onConflict: "tenant_id" },
      );

    // 部分マイグレーション対応。monthly_cost_cap_jpy 列だけ無い環境では、まず
    // auto_actions を残したまま cost-cap 列だけ外して保存する (auto-action トグルの
    // 編集を失わせない)。auto_actions も無い更に古い環境のときだけ基本列のみに落とす。
    if (error && isMissingColumnError(error)) {
      ({ error } = await admin
        .from("tenant_ai_automation_settings")
        .upsert({ ...baseRow, auto_actions: cleanedAutoActions }, { onConflict: "tenant_id" }));

      if (error && isMissingColumnError(error)) {
        autoActionsPersisted = false;
        ({ error } = await admin.from("tenant_ai_automation_settings").upsert(baseRow, { onConflict: "tenant_id" }));
      }
    }

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
            autoActions: cleanedAutoActions,
            monthlyCostCapJpy: nextCostCap,
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
        autoActions: cleanedAutoActions,
      }),
    });

    return apiOk({
      settings: {
        enabled: nextEnabled,
        fieldPolicies: cleanedFieldPolicies,
        confidenceThreshold: nextThreshold,
        sourcePolicies: cleanedSourcePolicies,
        autoActions: cleanedAutoActions,
        monthlyCostCapJpy: nextCostCap,
      },
      persisted: true,
      ...(autoActionsPersisted
        ? {}
        : {
            autoActionsWarning:
              "auto_actions 列が未作成のため自動アクション設定は保存されていません (マイグレーション適用後に有効化されます)。",
          }),
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
    autoActions?: Record<string, boolean>;
  },
  after: {
    enabled: boolean;
    fieldPolicies: Record<string, string>;
    confidenceThreshold: number;
    sourcePolicies: Record<string, boolean>;
    autoActions?: Record<string, boolean>;
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
  const beforeActions = before.autoActions ?? {};
  const afterActions = after.autoActions ?? {};
  const actionChanges: Record<string, { from: boolean; to: boolean }> = {};
  const allActionKeys = new Set([...Object.keys(beforeActions), ...Object.keys(afterActions)]);
  for (const k of allActionKeys) {
    const b = beforeActions[k] === true;
    const a = afterActions[k] === true;
    if (b !== a) actionChanges[k] = { from: b, to: a };
  }
  if (Object.keys(actionChanges).length > 0) out.autoActions = actionChanges;
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
