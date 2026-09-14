/**
 * 部品装着レコード API。
 *
 *  POST /api/parts/installations  … 装着レコード作成（content_hash 算出・AI自動検査）
 *  GET  /api/parts/installations  … 一覧（job_order_id / vehicle_id で絞り込み）
 *
 * 設計: docs/parts-installation-integrity-design.md
 */

import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { partInstallationCreateSchema } from "@/lib/validations/partInstallation";
import { createInstallation } from "@/lib/parts/installationService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }

  const parsed = partInstallationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError("入力内容を確認してください。", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  try {
    const result = await createInstallation(caller.tenantId, caller.userId, parsed.data);
    return apiJson(result, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/installations POST");
  }
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const jobOrderId = url.searchParams.get("job_order_id");
  const vehicleId = url.searchParams.get("vehicle_id");

  try {
    // RLS（my_tenant_ids）でテナント越えは自動的に遮断される
    let q = supabase
      .from("part_installations")
      .select(
        "id, part_name, part_kind, quantity, unit, amount_jpy, status, required_assurance, content_hash, vehicle_id, job_order_id, customer_id, installed_at, customer_verified_at",
      )
      .order("installed_at", { ascending: false })
      .limit(200);

    if (jobOrderId) q = q.eq("job_order_id", jobOrderId);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return apiJson({ installations: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "parts/installations GET");
  }
}
