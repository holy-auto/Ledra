/**
 * 部品装着レコード API。
 *
 *  POST /api/parts/installations  … 装着レコード作成（content_hash 算出・AI自動検査）
 *  GET  /api/parts/installations  … 一覧（job_order_id / vehicle_id で絞り込み）
 *
 * 設計: docs/parts-installation-integrity-design.md
 */

import { apiJson, apiInternalError, apiValidationError } from "@/lib/api/response";

import { partInstallationCreateSchema } from "@/lib/validations/partInstallation";
import { createInstallation } from "@/lib/parts/installationService";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const POST = withCaller(
  async (req, { caller }) => {
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
  },
  { minRole: "staff", routeName: "parts/installations POST" },
);

export const GET = withCaller(
  async (req, { caller, supabase }) => {
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
  },
  { routeName: "parts/installations GET" },
);
