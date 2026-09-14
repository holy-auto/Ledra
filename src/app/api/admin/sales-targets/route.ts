import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** 目標値: 各指標は未設定 (null) を許容。負数は不可。 */
const targetValueSchema = z.coerce.number().int().min(0).max(2_147_483_647).nullable();

const putSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  target_revenue: targetValueSchema.optional().default(null),
  target_jobs: targetValueSchema.optional().default(null),
  target_new_customers: targetValueSchema.optional().default(null),
});

/** year/month クエリのパース。未指定なら現在年月にフォールバック。 */
function resolveYearMonth(req: NextRequest): { year: number; month: number } {
  const now = new Date();
  const url = new URL(req.url);
  const yearRaw = Number(url.searchParams.get("year"));
  const monthRaw = Number(url.searchParams.get("month"));
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;
  return { year, month };
}

// GET: 指定 (またはデフォルト当月) の売上目標を取得。未設定なら target: null。
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { year, month } = resolveYearMonth(req);

    const { data, error } = await supabase
      .from("sales_targets")
      .select("year, month, target_revenue, target_jobs, target_new_customers")
      .eq("tenant_id", caller.tenantId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (error) return apiInternalError(error, "sales-targets GET");

    return apiJson({ year, month, target: data ?? null });
  } catch (e: unknown) {
    return apiInternalError(e, "sales-targets GET");
  }
}

// PUT: 目標値を (tenant_id, year, month) 単位で upsert。
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 売上目標の変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { year, month, target_revenue, target_jobs, target_new_customers } = parsed.data;

    const row = {
      tenant_id: caller.tenantId,
      year,
      month,
      target_revenue,
      target_jobs,
      target_new_customers,
      updated_at: new Date().toISOString(),
    };

    // upsert: 既存があれば update、なければ insert。
    const { data: existing, error: selErr } = await supabase
      .from("sales_targets")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (selErr) return apiInternalError(selErr, "sales-targets PUT");

    if (existing) {
      const { error } = await supabase
        .from("sales_targets")
        .update(row)
        .eq("tenant_id", caller.tenantId)
        .eq("year", year)
        .eq("month", month);
      if (error) return apiInternalError(error, "sales-targets PUT");
    } else {
      const { error } = await supabase.from("sales_targets").insert({ ...row, id: crypto.randomUUID() });
      if (error) return apiInternalError(error, "sales-targets PUT");
    }

    return apiJson({ ok: true, target: { year, month, target_revenue, target_jobs, target_new_customers } });
  } catch (e: unknown) {
    return apiInternalError(e, "sales-targets PUT");
  }
}
