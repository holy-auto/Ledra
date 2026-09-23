/**
 * 型式 × 品番 の取付工数マスタ（labor_hour_masters）の一覧・CSV 一括登録・削除。
 * 算出は /api/admin/labor-hours/quote（src/lib/pricing/laborMaster.ts）。
 */
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  classifyAgainstExisting,
  normalizeModelCode,
  parseLaborCsv,
  type ExistingLaborRow,
} from "@/lib/pricing/laborMaster";

export const dynamic = "force-dynamic";

const COLUMNS = "id, model_code, part_key, part_number, label, hours, fixed_price, source_url, updated_at, created_at";
// ponytail: 一覧は上限件数で打ち切る。天井: 1テナント数千行を超えたらページングを付ける。
const LIST_LIMIT = 2000;

export const GET = withCaller(
  async (req, { caller, supabase }) => {
    const model = normalizeModelCode(new URL(req.url).searchParams.get("model_code"));
    let q = supabase
      .from("labor_hour_masters")
      .select(COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("model_code")
      .order("part_key")
      .limit(LIST_LIMIT);
    if (model) q = q.eq("model_code", model);
    const { data, error } = await q;
    if (error) return apiInternalError(error, "labor-hours GET");
    return apiJson({ entries: data ?? [], limit: LIST_LIMIT });
  },
  { routeName: "labor-hours GET" },
);

const importSchema = z.object({
  csv: z.string().min(1, "CSV が空です").max(2_000_000),
});
// 既存行は登録する型式の行をまとめて読み、アプリ側で (型式, 品番キー) を突き合わせる。
// 品番キー（日本語の品名を含む）を in() で URL に並べると、200 件で URL が長すぎて 400 になった
// （2026-09-23 本番、MISTAKE_LEDGER M-20260923-fixed-url-length-in-one-route-not-its-sibling）。
// PostgREST の max_rows(1000) ごとに読む。ponytail: 天井は 50 ページ（5万行）。
const PAGE = 1000;
const MAX_PAGES = 50;

export const POST = withCaller(
  async (req, { caller }) => {
    const parsed = importSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { rows, errors } = parseLaborCsv(parsed.data.csv);
    if (rows.length === 0) return apiValidationError(errors[0] ?? "有効な行がありません");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const models = [...new Set(rows.map((r) => r.model_code))];
    const existing: ExistingLaborRow[] = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data, error } = await admin
        .from("labor_hour_masters")
        .select("model_code, part_key, hours, fixed_price, part_number, label, source_url")
        .eq("tenant_id", caller.tenantId)
        .in("model_code", models)
        .order("id")
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (error) return apiInternalError(error, "labor-hours import lookup");
      existing.push(...((data ?? []) as ExistingLaborRow[]));
      if ((data ?? []).length < PAGE) break;
    }

    const { toInsert, unchanged, metaUpdates, conflicts } = classifyAgainstExisting(rows, existing);
    // 登録済みと値が違う行は、あとから入ってきた今回の値で上書きする（2026-09-23 代表判断）
    const toWrite = [...toInsert, ...metaUpdates, ...conflicts.map((c) => c.row)];
    if (toWrite.length > 0) {
      const now = new Date().toISOString();
      const { error } = await admin.from("labor_hour_masters").upsert(
        toWrite.map((r) => ({ ...r, tenant_id: caller.tenantId, updated_at: now })),
        { onConflict: "tenant_id,model_code,part_key" },
      );
      if (error) return apiInternalError(error, "labor-hours import");
    }
    return apiJson({
      ok: true,
      inserted: toInsert.length,
      updated: conflicts.length,
      unchanged: unchanged.length + metaUpdates.length,
      overwritten: conflicts.map((c) => c.conflict),
      errors,
    });
  },
  { permission: "menu_items:manage", routeName: "labor-hours POST" },
);

const deleteSchema = z.object({ id: z.string().uuid() });

export const DELETE = withCaller(
  async (req, { caller }) => {
    const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("無効なIDです。");
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("labor_hour_masters")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "labor-hours DELETE");
    return apiJson({ ok: true });
  },
  { permission: "menu_items:manage", routeName: "labor-hours DELETE" },
);
