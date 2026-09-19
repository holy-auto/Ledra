import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { withdrawApplication } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/field-test/applications/[id] — 応募取り下げ */
export const PATCH = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, supabase, params }) => {
    const body = await req.json();
    if (body.action !== "withdraw") {
      return apiValidationError('action は "withdraw" のみ対応しています。');
    }

    const result = await withdrawApplication(supabase, caller.tenantId, params.id);
    return apiJson(result);
  },
  { routeName: "ft tenant application withdraw" },
);
