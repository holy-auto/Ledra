import { apiOk, apiValidationError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { workEventSchema } from "@/lib/validations/outsourcedWork";
import { recordWorkEvent } from "@/lib/outsourcedWork/service";
import { serviceFailure } from "../_shared";

export const dynamic = "force-dynamic";

/** 遷移を伴わないイベント: 三方向照合・担当者割当・訂正・完了後再施工（申請/承認/記録）。 */
export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const parsed = workEventSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    const result = await recordWorkEvent(caller, params.id, parsed.data);
    if (!result.ok) return serviceFailure(result);
    return apiOk(result.data);
  },
  {
    // 確認者（PER-017〜019）はテナントロールが viewer でもありうる。実行主体の判定は rules.ts に一本化する。
    minRole: "viewer",
    rateLimit: "admin_write",
    routeName: "admin/outsourced-work/[id]/events POST",
  },
);
