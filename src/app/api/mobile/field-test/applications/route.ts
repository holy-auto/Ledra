import { NextRequest, after } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  listTenantApplications,
  createApplication,
  getRecruitmentDetail,
  applicationInputSchema,
  isRecruitmentExpired,
} from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const applications = await listTenantApplications(caller.supabase, caller.tenantId);
    return apiJson({ applications });
  } catch (e) {
    return apiInternalError(e, "mobile ft applications GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const parsed = applicationInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { recruitment_id: recruitmentId, notes } = parsed.data;

    const rec = await getRecruitmentDetail(caller.supabase, recruitmentId);
    if (!rec) return apiValidationError("募集が見つかりません。");
    if (!rec.is_open) return apiValidationError("この募集は締め切られています。");
    if (isRecruitmentExpired(rec.deadline as string | null)) {
      return apiValidationError("この募集は締め切りを過ぎています。");
    }

    const application = await createApplication(caller.supabase, {
      recruitment_id: recruitmentId,
      project_id: rec.project_id as string,
      manufacturer_id: rec.manufacturer_id as string,
      tenant_id: caller.tenantId,
      applied_by: caller.userId,
      notes,
    });

    after(async () => {
      await notifyFtTenant({
        tenantId: caller.tenantId,
        type: "ft_recruitment_opened",
        title: "実証テストに応募しました",
        body: `「${rec.title}」に応募しました。`,
        linkPath: `/admin/field-test`,
      });
    });

    return apiJson(application);
  } catch (e) {
    if ((e as { code?: string })?.code === "FT_DUPLICATE_APPLICATION") {
      return apiValidationError((e as Error).message);
    }
    return apiInternalError(e, "mobile ft applications POST");
  }
}
