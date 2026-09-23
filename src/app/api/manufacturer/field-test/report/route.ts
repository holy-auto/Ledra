import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { renderFieldTestReport, type FtReportData } from "@/lib/pdf/pdfFieldTestReport";
import { contentDispositionAttachment } from "@/lib/csv/serialize";
import { aggregateFtProject } from "@/lib/fieldTest/projectAggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/report?project_id=xxx
 *
 * Generate a PDF summary report for a field-test project. Admin only.
 * Returns application/pdf as attachment.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("レポート生成は admin ロールのみ実行できます。");

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft report — admin caller PDF generation");
    const mfId = caller.manufacturerId;

    // Fetch project
    const { data: project, error: projErr } = await admin
      .from("ft_projects")
      .select("id, name, status, product_name, budget, target_units, starts_at, ends_at")
      .eq("id", projectId)
      .eq("manufacturer_id", mfId)
      .maybeSingle();
    if (projErr) return apiInternalError(projErr, "ft report project lookup");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    const agg = await aggregateFtProject(admin, { project_id: projectId, manufacturer_id: mfId });

    // ── Build report data ── 集計は analytics と共有（projectAggregate）
    const reportData: FtReportData = {
      project: {
        id: project.id as string,
        name: project.name as string,
        status: project.status as string,
        product_name: project.product_name as string | null,
        budget: project.budget as number | null,
        target_units: project.target_units as number | null,
        starts_at: project.starts_at as string | null,
        ends_at: project.ends_at as string | null,
      },
      generated_at: new Date().toISOString(),
      jobs: agg.jobs,
      inspections: agg.inspections,
      defects: agg.defects,
      evidence: agg.evidence,
      tenants_detail: agg.tenants_detail,
    };

    // ── Render PDF ──
    const pdfBuffer = await renderFieldTestReport(reportData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // \u65E5\u672C\u8A9E\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u540D\u3067\u3082 500 \u306B\u306A\u3089\u306A\u3044\u3088\u3046 RFC 5987 \u3067\u7D44\u307F\u7ACB\u3066\u308B
        // \uFF08ASCII \u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF + filename*\uFF09\u3002
        "content-disposition": contentDispositionAttachment(`ft_report_${project.name as string}.pdf`),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "ft report GET");
  }
}
