import { apiOk, apiNotFound } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { getWorkRequestDetail } from "@/lib/outsourcedWork/service";

export const dynamic = "force-dynamic";

/** 作業依頼の詳細と時系列（部品・受領試行・イベント）、caller が今起こせる次のアクション。 */
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const result = await getWorkRequestDetail(caller, params.id);
    if (!result.ok) return apiNotFound(result.message);
    return apiOk(result.data);
  },
  { minRole: "viewer", routeName: "admin/outsourced-work/[id] GET" },
);
