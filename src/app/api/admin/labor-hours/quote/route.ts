/**
 * POST /api/admin/labor-hours/quote
 *
 * 帳票の明細（品番 or 作業名）と型式・支店から、工数マスタで工賃を算出する（AI 不使用）。
 * 品番で見つからない行は alt_keys（品名）でも引く（d-Happy 由来の工数は品名で登録されるため）。
 * 工賃 = 工数 × 時間単価（支店 → 自社の順）、または定額。マスタに無い行は unit_price: null。
 * tc_code を渡すと、その TC 専用の工数を優先し、無ければ TC を問わない工数を使う。
 */
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  ANY_MODEL,
  findEntryWithFallback,
  laborPrice,
  normalizeModelCode,
  resolveRate,
  type LaborEntry,
} from "@/lib/pricing/laborMaster";

export const dynamic = "force-dynamic";

const schema = z.object({
  model_code: z.string().trim().min(1, "型式を入力してください").max(20),
  tc_code: z.string().trim().max(20).nullish(),
  branch_id: z.string().uuid().nullish(),
  keys: z.array(z.string().max(300)).min(1).max(200),
  // keys と同じ並び。品番で見つからないときに使う品名（無ければ null）
  alt_keys: z.array(z.string().max(300).nullable()).max(200).optional(),
});
// 品名（label）でも照合するため、型式（と型式共通）の行をまとめて読みアプリ側で引く。
// PostgREST の max_rows(1000) ごとに読む。ponytail: 1型式あたり数百行想定。天井: 1型式が数千行を
// 超えたら照合を DB 側（正規化した label 列＋索引）へ移す。
const PAGE = 1000;
const MAX_PAGES = 10;

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { branch_id, keys } = parsed.data;
    const altKeys = parsed.data.alt_keys ?? [];
    const model = normalizeModelCode(parsed.data.model_code);

    const [entriesRes, tenantRes, branchRes] = await Promise.all([
      (async () => {
        const data: LaborEntry[] = [];
        for (let p = 0; p < MAX_PAGES; p++) {
          const res = await supabase
            .from("labor_hour_masters")
            .select("model_code, tc_code, part_key, hours, fixed_price, label")
            .eq("tenant_id", caller.tenantId)
            .in("model_code", [model, ANY_MODEL])
            .order("id")
            .range(p * PAGE, p * PAGE + PAGE - 1);
          if (res.error) return { data, error: res.error };
          data.push(...((res.data ?? []) as LaborEntry[]));
          if ((res.data ?? []).length < PAGE) break;
        }
        return { data, error: null };
      })(),
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

    const entries = entriesRes.data.map((e) => ({
      ...e,
      hours: e.hours == null ? null : Number(e.hours), // numeric は文字列で返ることがある
    }));
    const branchRate = (branchRes.data as { labor_rate_per_hour?: number | null } | null)?.labor_rate_per_hour;
    const tenantRate = (tenantRes.data as { labor_rate_per_hour?: number | null } | null)?.labor_rate_per_hour;
    const rate = resolveRate(branchRate, tenantRate);

    const lines = keys.map((key, i) => {
      const { entry, by } = findEntryWithFallback(entries, model, key, altKeys[i], parsed.data.tc_code);
      return {
        key,
        matched: entry != null,
        matched_by: by,
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
