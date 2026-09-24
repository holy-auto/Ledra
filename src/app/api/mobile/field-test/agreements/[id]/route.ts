import { NextRequest, after } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { acceptAgreement } from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

const AGREEMENT_TYPE_JA: Record<string, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "契約書",
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "accept") {
      return apiValidationError('action は "accept" のみ対応しています。');
    }

    const result = await acceptAgreement(caller.supabase, caller.tenantId, id, caller.userId);

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
  } catch (e) {
    if ((e as { code?: string })?.code === "FT_STATE_CONFLICT") return apiValidationError((e as Error).message);
    return apiInternalError(e, "mobile ft agreement accept");
  }
}
