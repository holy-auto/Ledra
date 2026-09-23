/**
 * POST /api/admin/labor-hours/quote
 *
 * 帳票の明細（品番 or 作業名）と型式・支店から、工数マスタで工賃を算出する（AI 不使用）。
 * 工賃 = 工数 × 時間単価（支店 → 自社の順）、または定額。マスタに無い行は unit_price: null。
 */
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  ANY_MODEL,
  findEntry,
  laborPrice,
  normalizeKey,
  normalizeModelCode,
  resolveRate,
  type LaborEntry,
} from "@/lib/pricing/laborMaster";

export const dynamic = "force-dynamic";

const schema = z.object({
  model_code: z.string().trim().min(1, "型式を入力してください").max(20),
  branch_id: z.string().uuid().nullish(),
  keys: z.array(z.string().max(300)).min(1).max(200),
});

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { branch_id, keys } = parsed.data;
    const model = normalizeModelCode(parsed.data.model_code);
    const partKeys = [...new Set(keys.map(normalizeKey).filter(Boolean))];

    const [entriesRes, tenantRes, branchRes] = await Promise.all([
      partKeys.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("labor_hour_masters")
            .select("model_code, part_key, hours, fixed_price, label")
            .eq("tenant_id", caller.tenantId)
            .in("model_code", [model, ANY_MODEL])
            .in("part_key", partKeys),
      supabase.from("tenants").select("labor_rate_per_hour").eq("id", caller.tenantId).single(),
      branch_id
        ? supabase
            .from("customer_branches")
            .select("labor_rate_per_hour")
            .eq("id", branch_id)
            .eq("tenant_id", caller.tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (entriesRes.error) return apiInternalError(entriesRes.error, "labor-hours quote");

    const entries = ((entriesRes.data ?? []) as LaborEntry[]).map((e) => ({
      ...e,
      hours: e.hours == null ? null : Number(e.hours), // numeric は文字列で返ることがある
    }));
    const branchRate = (branchRes.data as { labor_rate_per_hour?: number | null } | null)?.labor_rate_per_hour;
    const tenantRate = (tenantRes.data as { labor_rate_per_hour?: number | null } | null)?.labor_rate_per_hour;
    const rate = resolveRate(branchRate, tenantRate);

    const lines = keys.map((key) => {
      const entry = findEntry(entries, model, key);
      return {
        key,
        matched: entry != null,
        hours: entry?.hours ?? null,
        fixed_price: entry?.fixed_price ?? null,
        unit_price: entry ? laborPrice(entry, rate) : null,
      };
    });

    return apiJson({
      model_code: model,
      rate_per_hour: rate,
      rate_source: branchRate && branchRate > 0 ? "branch" : rate ? "tenant" : null,
      lines,
    });
  },
  { minRole: "staff", routeName: "labor-hours/quote POST" },
);
