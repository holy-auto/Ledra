import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { vehicleShakenUpdateSchema } from "@/lib/validations/vehicle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 車検満了日管理 API。
 *
 * 車検満了日は既存の vehicles.inspection_expiry_date を正とする
 * (専用カラムは追加しない — 20260612000023_vehicle_shaken.sql 参照)。
 *
 * 読み書きは RLS を尊重する server client 経由 (テナント境界は RLS が担保)。
 */

const DEFAULT_DAYS_AHEAD = 60;
const MAX_DAYS_AHEAD = 365;
/** 期限切れも含めて表示する遡及日数 (今日 - この日数 以降を返す)。 */
const LOOKBACK_DAYS = 30;

type VehicleShakenRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  inspection_expiry_date: string | null;
  inspection_reminder_sent_at: string | null;
  customer: { id: string; name: string | null; phone: string | null } | null;
};

/** サーバのローカル日付を YYYY-MM-DD で返す (JST 運用前提)。 */
function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" に日数を足して "YYYY-MM-DD" を返す。 */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 2つの "YYYY-MM-DD" の日数差 (target - base)。 */
function daysBetween(base: string, target: string): number {
  const b = Date.parse(`${base}T00:00:00Z`);
  const t = Date.parse(`${target}T00:00:00Z`);
  return Math.round((t - b) / 86_400_000);
}

// ─── GET: 車検満了が近い (または直近で切れた) 車両一覧 ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const rawDaysAhead = Number(url.searchParams.get("days_ahead"));
    const daysAhead =
      Number.isFinite(rawDaysAhead) && rawDaysAhead > 0
        ? Math.min(MAX_DAYS_AHEAD, Math.floor(rawDaysAhead))
        : DEFAULT_DAYS_AHEAD;

    const today = todayString();
    const upperBound = addDaysStr(today, daysAhead); // 今日 + days_ahead
    const lowerBound = addDaysStr(today, -LOOKBACK_DAYS); // 今日 - 30 日 (期限切れも拾う)

    // RLS でテナント分離。明示的に tenant_id も絞り込み (多重所属対策)。
    const { data, error } = await supabase
      .from("vehicles")
      .select(
        "id, maker, model, year, plate_display, inspection_expiry_date, inspection_reminder_sent_at, customer:customers(id, name, phone)",
      )
      .eq("tenant_id", caller.tenantId)
      .not("inspection_expiry_date", "is", null)
      .gte("inspection_expiry_date", lowerBound)
      .lte("inspection_expiry_date", upperBound)
      .order("inspection_expiry_date", { ascending: true })
      .limit(500)
      .returns<VehicleShakenRow[]>();

    if (error) return apiInternalError(error, "vehicles/shaken GET");

    const vehicles = (data ?? []).map((v) => ({
      id: v.id,
      maker: v.maker,
      model: v.model,
      year: v.year,
      plate_display: v.plate_display,
      shaken_expiry_date: v.inspection_expiry_date,
      reminder_sent_at: v.inspection_reminder_sent_at,
      days_until_expiry: v.inspection_expiry_date ? daysBetween(today, v.inspection_expiry_date) : null,
      customer_name: v.customer?.name ?? null,
      customer_phone: v.customer?.phone ?? null,
    }));

    return apiJson({ ok: true, today, days_ahead: daysAhead, vehicles });
  } catch (e) {
    return apiInternalError(e, "vehicles/shaken GET");
  }
}

// ─── PATCH: 車検満了日を更新 (変更時はリマインダー送信記録をリセット) ───
export async function PATCH(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(req, vehicleShakenUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const { vehicle_id, shaken_expiry_date } = parsed.data;

    // 既存の満了日を確認し、日付が変わったときだけ sent_at をリセットする。
    // (同じ日付の再保存でリマインダー再送をトリガしないため)
    const { data: existing, error: fetchErr } = await supabase
      .from("vehicles")
      .select("id, inspection_expiry_date")
      .eq("id", vehicle_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle<{ id: string; inspection_expiry_date: string | null }>();
    if (fetchErr) return apiInternalError(fetchErr, "vehicles/shaken PATCH fetch");
    if (!existing) return apiNotFound("対象の車両が見つかりません。");

    const dateChanged = (existing.inspection_expiry_date ?? null) !== (shaken_expiry_date ?? null);
    const updates: Record<string, unknown> = { inspection_expiry_date: shaken_expiry_date };
    if (dateChanged) updates.inspection_reminder_sent_at = null;

    // RLS が UPDATE を tenant 境界で担保するが、明示的に tenant_id でも絞る。
    const { data: updated, error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", vehicle_id)
      .eq("tenant_id", caller.tenantId)
      .select("id, inspection_expiry_date, inspection_reminder_sent_at")
      .maybeSingle<{
        id: string;
        inspection_expiry_date: string | null;
        inspection_reminder_sent_at: string | null;
      }>();
    if (error) return apiInternalError(error, "vehicles/shaken PATCH");
    if (!updated) return apiNotFound("対象の車両が見つかりません。");

    return apiJson({
      ok: true,
      vehicle: {
        id: updated.id,
        shaken_expiry_date: updated.inspection_expiry_date,
        reminder_sent_at: updated.inspection_reminder_sent_at,
      },
    });
  } catch (e) {
    return apiInternalError(e, "vehicles/shaken PATCH");
  }
}
