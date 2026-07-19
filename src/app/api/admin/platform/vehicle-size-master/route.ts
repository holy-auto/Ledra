import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseVehicleMasterCsv } from "@/lib/vehicles/vehicleMasterImport";

export const dynamic = "force-dynamic";

// vehicle_size_master は全テナント共有のグローバル参照データ。1テナントが汚染すると
// 全店の概算に影響するため、書き込みは運営 (platform admin) のみに限定する。
const MAX_CSV_BYTES = 4_000_000; // ~4MB (数千行を許容)
const UPSERT_CHUNK = 500;

/** GET: 現在の登録件数 (UI 表示用)。 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("vehicle-size-master 件数集計 — グローバル参照データ");
    const { count, error } = await admin.from("vehicle_size_master").select("*", { count: "exact", head: true });
    if (error) return apiInternalError(error, "vehicle-size-master count");
    return apiJson({ total: count ?? 0 });
  } catch (e) {
    return apiInternalError(e, "vehicle-size-master GET");
  }
}

/**
 * POST: CSV 一括インポート (upsert)。
 * body: { action: "csv_import", csv: string }
 * CSV 列: maker, model, full_length_mm, full_width_mm, full_height_mm, body_type?, size_class?
 * size_class は寸法から自動算出 (寸法が無い行のみ明示指定を許可)。
 * 既存の (maker, model) は寸法・サイズ区分を更新 (再インポートで補正できる)。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "csv_import") return apiValidationError("action は csv_import のみ対応しています");
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) return apiValidationError("CSV が空です");
    if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) return apiValidationError("CSV が大きすぎます (上限4MB)");

    const { rows, errors } = parseVehicleMasterCsv(csv);
    if (rows.length === 0) {
      return apiValidationError(errors[0] ?? "有効な行がありません");
    }

    const admin = createPlatformScopedAdmin("vehicle-size-master CSV一括インポート — グローバル参照データ");
    let upserted = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { data, error } = await admin
        .from("vehicle_size_master")
        .upsert(chunk, { onConflict: "maker,model" })
        .select("id");
      if (error) return apiInternalError(error, "vehicle-size-master upsert");
      upserted += data?.length ?? 0;
    }

    return apiJson({
      ok: true,
      upserted,
      total_rows: rows.length,
      skipped: errors.length,
      // 大量エラー時にレスポンスが膨らまないよう先頭50件だけ返す。
      errors: errors.slice(0, 50),
    });
  } catch (e) {
    return apiInternalError(e, "vehicle-size-master POST");
  }
}
