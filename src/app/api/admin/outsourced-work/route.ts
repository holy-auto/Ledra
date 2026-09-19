import { apiOk, apiValidationError, apiError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { createWorkRequestSchema } from "@/lib/validations/outsourcedWork";
import { createWorkRequest, listContractorCandidates, listWorkRequests } from "@/lib/outsourcedWork/service";

export const dynamic = "force-dynamic";

/**
 * 外注施工の作業依頼。発注元としても施工事業者としても、自テナントが関わる依頼が出る。
 * 依頼ごとの立場（発注元管理者／施工担当者…）と操作可否は service 側（rules.ts）で決まる。
 */
export const GET = withCaller(
  async (_req, { caller }) => {
    const [requests, contractors] = await Promise.all([
      listWorkRequests(caller),
      listContractorCandidates(caller.tenantId),
    ]);
    return apiOk({ requests, contractors });
  },
  { minRole: "viewer", routeName: "admin/outsourced-work GET" },
);

/** AC-001 作業依頼作成（PER-001: 発注元店舗担当者・発注元管理者）。 */
export const POST = withCaller(
  async (req, { caller }) => {
    const parsed = createWorkRequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    const result = await createWorkRequest(caller, parsed.data);
    if (!result.ok)
      return apiError({
        code: result.code === "validation" ? "validation_error" : result.code,
        message: result.message,
        status: result.code === "forbidden" ? 403 : 400,
      });
    return apiOk({ request: result.data }, 201);
  },
  { minRole: "staff", rateLimit: "admin_write", routeName: "admin/outsourced-work POST" },
);
