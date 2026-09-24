/**
 * GET /api/admin/labor-hours/coverage
 *
 * 工数マスタの型式ごとの登録行数と、自テナントの登録車両の車台番号を返す。
 * 型式ごとの集計・未収集の判定は画面側で summarizeCoverage が行う（貼り付けた車台番号も合流させるため）。
 */
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// PostgREST は1回の応答を max_rows（1000）で打ち切るため、1000 行ずつ読み切る。
// ponytail: 行を読んで JS で数える。天井: 工数マスタが数万行を超えたら型式ごとの集計を
// DB 側（ビューか RPC）へ移す。暴走防止に 50 ページで止める。
const PAGE = 1000;
const MAX_PAGES = 50;

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await page(p * PAGE, p * PAGE + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return { data: out, error: null };
}

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    const [masters, vehicles] = await Promise.all([
      readAll<{ model_code: string }>((from, to) =>
        supabase
          .from("labor_hour_masters")
          .select("model_code")
          .eq("tenant_id", caller.tenantId)
          .order("id")
          .range(from, to),
      ),
      readAll<{ vin_code: string | null }>((from, to) =>
        supabase
          .from("vehicles")
          .select("vin_code")
          .eq("tenant_id", caller.tenantId)
          .not("vin_code", "is", null)
          .order("id")
          .range(from, to),
      ),
    ]);
    if (masters.error) return apiInternalError(masters.error, "labor-hours coverage masters");
    if (vehicles.error) return apiInternalError(vehicles.error, "labor-hours coverage vehicles");

    const registeredRowsByModel: Record<string, number> = {};
    for (const r of masters.data) {
      registeredRowsByModel[r.model_code] = (registeredRowsByModel[r.model_code] ?? 0) + 1;
    }
    return apiJson({
      registered_rows_by_model: registeredRowsByModel,
      vehicle_chassis: vehicles.data.map((v) => v.vin_code).filter((v): v is string => !!v),
    });
  },
  { routeName: "labor-hours/coverage GET" },
);
