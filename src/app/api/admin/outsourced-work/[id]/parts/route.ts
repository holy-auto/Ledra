import { apiOk, apiValidationError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { suppliedPartSchema } from "@/lib/validations/outsourcedWork";
import { addSuppliedPart } from "@/lib/outsourcedWork/service";
import { serviceFailure } from "../_shared";

export const dynamic = "force-dynamic";

/** PER-002 支給部品登録（依頼作成の段階のみ。承認後は固定 AC-002）。 */
export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const parsed = suppliedPartSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    const result = await addSuppliedPart(caller, params.id, parsed.data);
    if (!result.ok) return serviceFailure(result);
    return apiOk({ part: result.data }, 201);
  },
  { minRole: "staff", rateLimit: "admin_write", routeName: "admin/outsourced-work/[id]/parts POST" },
);
