import { apiOk, apiValidationError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { transitionSchema } from "@/lib/validations/outsourcedWork";
import { transitionWorkRequest } from "@/lib/outsourcedWork/service";
import { serviceFailure } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * 状態遷移（遷移表 TR-001〜047）。構造は OUTSOURCED_WORK_TRANSITIONS、実行主体は rules.ts、
 * 必要な記録は service.ts が見る。例外承認・却下の後の復帰はシステムが同じ呼び出しの中で行う。
 */
export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const parsed = transitionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    const result = await transitionWorkRequest(caller, params.id, parsed.data);
    if (!result.ok) return serviceFailure(result);
    return apiOk(result.data);
  },
  { minRole: "staff", rateLimit: "admin_write", routeName: "admin/outsourced-work/[id]/transition POST" },
);
