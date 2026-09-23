import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import {
  listTenantApplications,
  createApplication,
  getRecruitmentDetail,
  applicationInputSchema,
  isRecruitmentExpired,
} from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/applications — 自社応募一覧 */
export const GET = withCaller(
  async (_req: NextRequest, { caller, supabase }) => {
    const applications = await listTenantApplications(supabase, caller.tenantId);
    return apiJson({ applications });
  },
  { routeName: "ft tenant applications GET" },
);

/**
 * POST /api/admin/field-test/applications — 応募作成
 * Body: { recruitment_id: string, notes?: string }
 */
export const POST = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const parsed = applicationInputSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { recruitment_id: recruitmentId, notes } = parsed.data;

    // 募集情報を取得して project_id / manufacturer_id を解決
    const rec = await getRecruitmentDetail(supabase, recruitmentId);
    if (!rec) return apiValidationError("募集が見つかりません。");
    if (!rec.is_open) return apiValidationError("この募集は締め切られています。");
    if (isRecruitmentExpired(rec.deadline as string | null)) {
      return apiValidationError("この募集は締め切りを過ぎています。");
    }

    let application;
    try {
      application = await createApplication(supabase, {
        recruitment_id: recruitmentId,
        project_id: rec.project_id as string,
        manufacturer_id: rec.manufacturer_id as string,
        tenant_id: caller.tenantId,
        applied_by: caller.userId,
        notes,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "FT_DUPLICATE_APPLICATION") {
        return apiValidationError((e as Error).message);
      }
      throw e;
    }

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
  },
  { routeName: "ft tenant applications POST" },
);
