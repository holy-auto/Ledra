import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { vehicleCreateSchema } from "@/lib/validations/vehicle";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createCustomerResolver } from "@/lib/customers/resolveCustomer";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CsvRow = {
  maker: string;
  model: string;
  year: number | null;
  plate_display: string | null;
  vin_code: string | null;
  notes: string | null;
  // 顧客連携用 (任意列): customer_name, customer_phone, customer_email
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitLine = (l: string) => l.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));

  let start = 0;
  const head = splitLine(lines[0]).map((x) => x.toLowerCase());
  // Skip header row if detected (first col is "maker")
  if (head[0] === "maker") start = 1;

  const out: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const maker = (cols[0] || "").trim();
    const model = (cols[1] || "").trim();
    if (!maker) throw new Error(`CSVエラー: ${i + 1}行目のメーカー名が空です`);
    if (!model) throw new Error(`CSVエラー: ${i + 1}行目の車種が空です`);

    const yearRaw = (cols[2] || "").trim();
    const year = yearRaw ? parseInt(yearRaw, 10) : null;
    if (yearRaw && isNaN(year!)) throw new Error(`CSVエラー: ${i + 1}行目の年式が不正です`);

    out.push({
      maker,
      model,
      year: year && year >= 1900 && year <= 2100 ? year : null,
      plate_display: (cols[3] || "").trim() || null,
      vin_code: (cols[4] || "").trim() || null,
      notes: (cols[5] || "").trim() || null,
      // 任意列: 顧客名 / 電話 / メール (あれば顧客マスタに名寄せして連携)
      customer_name: (cols[6] || "").trim() || null,
      customer_phone: (cols[7] || "").trim() || null,
      customer_email: (cols[8] || "").trim() || null,
    });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "vehicles:create")) return apiForbidden();

    const body = await req.text();
    let rows: CsvRow[];
    try {
      rows = parseCsv(body);
    } catch (e) {
      return apiValidationError(e instanceof Error ? e.message : String(e));
    }

    if (rows.length === 0) {
      return apiJson({ ok: true, total: 0, inserted: 0, errors: [] });
    }

    const errors: Array<{ row: number; error: string }> = [];
    type VehicleInsert = {
      tenant_id: string;
      maker: string;
      model: string;
      year: number | null;
      plate_display: string | null;
      vin_code: string | null;
      notes: string | null;
      customer_id: string | null;
    };
    // 元 CSV 行番号を保持したまま挿入対象を組み立てる (エラー行番号の整合のため)。
    const validRows: Array<{ rowNo: number; data: VehicleInsert }> = [];

    // 顧客名寄せリゾルバ (バルクなので AI 判定はオフ)。顧客列が無ければ未使用。
    const resolver = await createCustomerResolver(supabase, caller.tenantId, { ai: false });

    // Validate all rows first, resolving customer link inline.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const parsed = vehicleCreateSchema.safeParse(r);
      if (!parsed.success) {
        errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "バリデーションエラー" });
        continue;
      }
      const b = parsed.data;

      let customerId: string | null = null;
      if (r.customer_name || r.customer_phone || r.customer_email) {
        const resolved = await resolver.resolve({
          name: r.customer_name,
          phone: r.customer_phone,
          email: r.customer_email,
        });
        customerId = resolved.customerId;
      }

      validRows.push({
        rowNo: i + 1,
        data: {
          tenant_id: caller.tenantId,
          maker: b.maker,
          model: b.model,
          year: b.year ?? null,
          plate_display: b.plate_display ?? null,
          vin_code: b.vin_code ?? null,
          notes: b.notes ?? null,
          customer_id: customerId,
        },
      });
    }

    // Batch insert valid rows in chunks of 100
    let inserted = 0;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const insertData = chunk.map((c) => c.data);

      const { error } = await supabase.from("vehicles").insert(insertData);
      if (error) {
        // If batch fails, fall back to individual inserts for this chunk
        for (const c of chunk) {
          const { error: singleErr } = await supabase.from("vehicles").insert(c.data);
          if (singleErr) {
            errors.push({ row: c.rowNo, error: singleErr.message });
          } else {
            inserted++;
          }
        }
      } else {
        inserted += chunk.length;
      }
    }

    return apiJson({
      ok: errors.length === 0,
      total: rows.length,
      inserted,
      errors,
    });
  } catch (e) {
    return apiInternalError(e, "vehicles/import-csv");
  }
}
