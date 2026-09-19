import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listTenantApplications, createApplication, getRecruitmentDetail } from "@/lib/fieldTest/tenantQueries";
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
    const body = await req.json();
    const recruitmentId = body.recruitment_id as string | undefined;
    const notes = body.notes as string | undefined;

    if (!recruitmentId) return apiValidationError("recruitment_id は必須です。");

    // 募集情報を取得して project_id / manufacturer_id を解決
    const rec = await getRecruitmentDetail(supabase, recruitmentId);
    if (!rec) return apiValidationError("募集が見つかりません。");
    if (!rec.is_open) return apiValidationError("この募集は締め切られています。");

    const application = await createApplication(supabase, {
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
  },
  { routeName: "ft tenant applications POST" },
);
