import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { vehicleCreateSchema } from "@/lib/validations/vehicle";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CsvRow = {
  maker: string;
  model: string;
  year: number | null;
  plate_display: string | null;
  vin_code: string | null;
  notes: string | null;
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
    });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

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
    const validRows: Array<{
      maker: string;
      model: string;
      year: number | null;
      plate_display: string | null;
      vin_code: string | null;
      notes: string | null;
    }> = [];

    // Validate all rows first
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const parsed = vehicleCreateSchema.safeParse(r);
      if (!parsed.success) {
        errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "バリデーションエラー" });
        continue;
      }
      validRows.push(parsed.data as (typeof validRows)[number]);
    }

    // Batch insert valid rows in chunks of 100
    let inserted = 0;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const insertData = chunk.map((b) => ({
        tenant_id: caller.tenantId,
        maker: b.maker,
        model: b.model,
        year: b.year ?? null,
        plate_display: b.plate_display ?? null,
        vin_code: b.vin_code ?? null,
        notes: b.notes ?? null,
      }));

      const { error } = await supabase.from("vehicles").insert(insertData);
      if (error) {
        // If batch fails, fall back to individual inserts for this chunk
        for (let j = 0; j < chunk.length; j++) {
          const b = chunk[j];
          const { error: singleErr } = await supabase.from("vehicles").insert({
            tenant_id: caller.tenantId,
            maker: b.maker,
            model: b.model,
            year: b.year ?? null,
            plate_display: b.plate_display ?? null,
            vin_code: b.vin_code ?? null,
            notes: b.notes ?? null,
          });
          if (singleErr) {
            errors.push({ row: i + j + 1, error: singleErr.message });
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
