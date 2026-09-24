import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { acceptAgreement } from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

const AGREEMENT_TYPE_JA: Record<string, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "契約書",
};

/** PATCH /api/admin/field-test/agreements/[id] — 同意 */
export const PATCH = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, supabase, params }) => {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "accept") {
      return apiValidationError('action は "accept" のみ対応しています。');
    }

    let result;
    try {
      result = await acceptAgreement(supabase, caller.tenantId, params.id, caller.userId);
    } catch (e) {
      if ((e as { code?: string })?.code === "FT_STATE_CONFLICT") return apiValidationError((e as Error).message);
      throw e;
    }

    after(async () => {
      const label = AGREEMENT_TYPE_JA[result.agreement_type as string] ?? "契約書";
      await notifyFtTenant({
        tenantId: caller.tenantId,
        type: "ft_job_assigned",
        title: "契約に同意しました",
        body: `${label}に同意しました。`,
        linkPath: `/admin/field-test`,
      });
    });

    return apiJson(result);
  },
  { routeName: "ft tenant agreement accept" },
);
