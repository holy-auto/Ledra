import { apiOk } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { generateEvidence } from "@/lib/outsourcedWork/service";
import { serviceFailure } from "../_shared";

export const dynamic = "force-dynamic";

/** AC-026 / AC-029 証明データを生成し、ハッシュを改ざん検知基盤（Polygon アンカー）へ送る。 */
export const POST = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const result = await generateEvidence(caller, params.id);
    if (!result.ok) return serviceFailure(result);
    return apiOk(result.data);
  },
  { minRole: "staff", rateLimit: "admin_write", routeName: "admin/outsourced-work/[id]/evidence POST" },
);
