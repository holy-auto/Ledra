

import { parsePagination } from "@/lib/api/pagination";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/** GET: テナントの全車両を取得（顧客情報付き） */
export const GET = withCaller(
  async (req, { caller, supabase }) => {
    try {

      const { searchParams } = new URL(req.url);
      const customerId = searchParams.get("customer_id");
      const q = searchParams.get("q")?.trim();
      const pagination = parsePagination(req);

      let query = supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display, vin_code, customer_id, customer:customers(id, name)", {
          count: "exact",
        })
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      // 手動連携ピッカー向けの簡易検索 (ナンバー / メーカー / 車種 / VIN の部分一致)。
      // ILIKE ワイルドカードに加え、PostgREST の or() 区切り文字 (, () ) も除去する。
      if (q) {
        const sq = escapePostgrestValue(escapeIlike(q));
        query = query.or(`plate_display.ilike.%${sq}%,maker.ilike.%${sq}%,model.ilike.%${sq}%,vin_code.ilike.%${sq}%`);
      }

      // Apply pagination if page param was provided
      if (pagination.page > 0) {
        query = query.range(pagination.from, pagination.to);
      }

      const { data: vehicles, error, count } = await query;

      if (error) {
        return apiInternalError(error, "admin/vehicles GET");
      }

      const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
      return apiJson(
        {
          vehicles: vehicles ?? [],
          ...(pagination.page > 0 && { page: pagination.page, per_page: pagination.perPage, total: count ?? 0 }),
        },
        { headers },
      );
    } catch (e: unknown) {
      return apiInternalError(e, "admin/vehicles GET");
    }
  },
  { routeName: "admin/vehicles GET" },
);
