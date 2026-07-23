import { NextRequest, after } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { insurerCaseCreateSchema } from "@/lib/validations/insurer-case";
import { applyAssignmentRules, type AssignmentRule } from "@/lib/insurer/applyAssignmentRules";
import { maybeAutoFraudScoreForCase } from "@/lib/ai/automation/fraudScoreAuto";
import { maybeAutoSummarizeCase } from "@/lib/ai/automation/caseSummaryAuto";
import { maybeAutoSuggestAssigneeForCase } from "@/lib/ai/automation/caseAssignAuto";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";

export const runtime = "nodejs";

/**
 * GET /api/insurer/cases
 * List cases for the current insurer with pagination + optional status filter.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Build query
    let query = admin
      .from("insurer_cases")
      .select(
        "id, insurer_id, title, description, status, priority, category, case_number, certificate_id, vehicle_id, tenant_id, assigned_to, created_by, resolved_at, closed_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (category) {
      query = query.ilike("category", `%${escapeIlike(category)}%`);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      // Include the full end day
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endDate.toISOString());
    }

    const certificateId = url.searchParams.get("certificate_id");
    const vehicleId = url.searchParams.get("vehicle_id");
    const tenantId = url.searchParams.get("tenant_id");

    if (certificateId) {
      query = query.eq("certificate_id", certificateId);
    }
    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }
    if (tenantId) {
      // Verify insurer has an active contract with this tenant before filtering
      const { data: contract } = await admin
        .from("insurer_tenant_contracts")
        .select("id")
        .eq("insurer_id", caller.insurerId)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!contract) {
        return apiValidationError("指定されたテナントとの契約が見つかりません。");
      }
      query = query.eq("tenant_id", tenantId);
    }

    if (q) {
      const safeQ = escapePostgrestValue(escapeIlike(q));
      query = query.or(`title.ilike.%${safeQ}%,case_number.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }

    const { data, error, count } = await query;

    if (error) return apiInternalError(error, "insurer.cases");

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson({ cases: data ?? [], total: count ?? 0 }, { headers });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/cases");
  }
}

/**
 * POST /api/insurer/cases
 * Create a new case.
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const parsed = insurerCaseCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { title, description, certificate_id, vehicle_id, priority, category, tenant_id: bodyTenantId } = parsed.data;

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Resolve tenant_id from certificate, vehicle, or direct parameter
    let tenant_id: string | null = bodyTenantId ?? null;
    if (!tenant_id && certificate_id) {
      const { data: cert } = await admin
        .from("certificates")
        .select("tenant_id")
        .eq("id", certificate_id)
        .maybeSingle();
      if (cert) tenant_id = cert.tenant_id;
    }
    if (!tenant_id && vehicle_id) {
      const { data: v } = await admin.from("vehicles").select("tenant_id").eq("id", vehicle_id).maybeSingle();
      if (v) tenant_id = v.tenant_id;
    }

    // Verify insurer has a contract with the resolved tenant
    if (tenant_id) {
      const { data: contract } = await admin
        .from("insurer_tenant_contracts")
        .select("id")
        .eq("insurer_id", caller.insurerId)
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!contract) {
        return apiValidationError("指定されたテナントとの契約が見つかりません。");
      }
    }

    // Auto-assignment: 既定ルールに合致するなら assigned_to を立てる。
    // ルール取得失敗 / マッチ無しのときは undefined のまま (= 人間が手動アサイン)
    let autoAssign: { ruleId: string; ruleName?: string; assignedTo: string } | null = null;
    try {
      const { data: rawRules } = await admin
        .from("insurer_assignment_rules")
        .select("id, name, condition_type, condition_value, assign_to, is_active")
        .eq("insurer_id", caller.insurerId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const rules = (rawRules ?? []) as AssignmentRule[];
      autoAssign = applyAssignmentRules(rules, {
        priority: priority ?? null,
        category: category ?? null,
        tenant_id,
      });
    } catch (ruleErr) {
      // ルール参照エラーで案件作成自体は失敗させない (フェイルオープン)
      console.error("[insurer.cases] applyAssignmentRules failed:", ruleErr);
    }

    const insertData: Record<string, unknown> = {
      insurer_id: caller.insurerId,
      title,
      created_by: caller.userId,
    };

    if (description) insertData.description = description;
    if (certificate_id) insertData.certificate_id = certificate_id;
    if (vehicle_id) insertData.vehicle_id = vehicle_id;
    if (tenant_id) insertData.tenant_id = tenant_id;
    if (priority) insertData.priority = priority;
    if (category) insertData.category = category;
    if (autoAssign) insertData.assigned_to = autoAssign.assignedTo;

    const { data: newCase, error } = await admin
      .from("insurer_cases")
      .insert(insertData)
      .select(
        "id, insurer_id, title, description, certificate_id, vehicle_id, tenant_id, priority, category, created_by, status, case_number, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "insurer.cases");

    // Log to insurer_access_logs
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_create",
      meta: {
        case_id: newCase.id,
        route: "POST /api/insurer/cases",
        ...(autoAssign
          ? {
              auto_assigned_to: autoAssign.assignedTo,
              auto_assignment_rule_id: autoAssign.ruleId,
              auto_assignment_rule_name: autoAssign.ruleName,
            }
          : {}),
      },
      ip,
      user_agent: ua,
    });

    // opt-in テナントでは、案件作成後に各 auto-action を実行 (fire-and-forget / レスポンス後)。
    // 3 つとも insurer_cases.meta を read-merge-write するため、並列だと最後の書き込みが他キーを
    // 上書きして失われる (lost update)。1 つの after() で **順次** 実行し、各処理が直前の書き込み後の
    // meta を読み直して安全にマージできるようにする (各 maybe* は内部で例外を握りつぶす)。
    after(async () => {
      // テナント (施工店) の基幹ソフト連携向け通知。購読が無ければ no-op。
      if (tenant_id) {
        await emitEntityWebhook(tenant_id, "insurer_case.created", newCase.id as string, {
          case_id: newCase.id,
          case_number: newCase.case_number,
          title: newCase.title,
          status: newCase.status,
          insurer_id: caller.insurerId,
          created_at: newCase.created_at,
        });
      }
      await maybeAutoFraudScoreForCase({
        caseId: newCase.id as string,
        insurerId: caller.insurerId,
        tenantId: tenant_id,
      });
      await maybeAutoSummarizeCase({
        caseId: newCase.id as string,
        insurerId: caller.insurerId,
        tenantId: tenant_id,
      });
      await maybeAutoSuggestAssigneeForCase({
        caseId: newCase.id as string,
        insurerId: caller.insurerId,
        tenantId: tenant_id,
      });
    });

    return apiJson({ case: newCase }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/cases");
  }
}
