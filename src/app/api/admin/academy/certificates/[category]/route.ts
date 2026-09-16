/**
 * GET /api/admin/academy/certificates/[category]
 *
 * カテゴリ修了証 PDF を生成してダウンロードさせる。
 * CERTIFICATE_THRESHOLD 未満の場合は 403 を返す。
 */
import { NextResponse } from "next/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";
import { renderAcademyCertificate, CATEGORY_LABEL, CERTIFICATE_THRESHOLD } from "@/lib/academy/certificate";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeCertNumber(userId: string, category: string, issueDate: string): string {
  // deterministic かつ推測困難な番号: userId の先頭8文字 + category + 月
  const prefix = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const ym = issueDate.slice(0, 7).replace("-", "");
  const cat = category.replace(/_/g, "").slice(0, 4).toUpperCase();
  return `LDRA-${cat}-${ym}-${prefix}`;
}

export const GET = withCaller<{ category: string }>(
  async (_req, { caller, supabase, params }) => {
    try {

      const { category } = params;

      if (!CATEGORY_LABEL[category]) return apiNotFound("カテゴリが見つかりません");

      // カテゴリ内の完了レッスン数を確認
      const { data: completions, error: cErr } = await supabase
        .from("academy_lesson_completions")
        .select("lesson_id")
        .eq("user_id", caller.userId);

      if (cErr) return apiInternalError(cErr);

      const lessonIds = (completions ?? []).map((c) => c.lesson_id as string);

      let categoryCount = 0;
      if (lessonIds.length > 0) {
        const { count, error: lErr } = await supabase
          .from("academy_lessons")
          .select("id", { count: "exact", head: true })
          .in("id", lessonIds)
          .eq("category", category);

        if (lErr) return apiInternalError(lErr);
        categoryCount = count ?? 0;
      }

      if (categoryCount < CERTIFICATE_THRESHOLD) {
        return apiForbidden(
          `${CATEGORY_LABEL[category]} コースの修了証には ${CERTIFICATE_THRESHOLD} 件以上の完了が必要です (現在: ${categoryCount} 件)`,
        );
      }

      // テナント名を取得
      const admin = createPlatformScopedAdmin("academy/certificates: tenant name 取得");
      const { data: tenant } = await admin.from("tenants").select("name").eq("id", caller.tenantId).maybeSingle();

      const tenantName = (tenant?.name as string | null) ?? "加盟店";
      const issueDate = new Date().toISOString().slice(0, 10);
      const certNumber = makeCertNumber(caller.userId, category, issueDate);

      const buf = await renderAcademyCertificate({
        category,
        tenant_name: tenantName,
        lesson_count: categoryCount,
        issue_date: issueDate,
        cert_number: certNumber,
      });

      const filename = `ledra-academy-${category}-certificate.pdf`;

      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { routeName: "admin/academy/certificates/[category] GET" },
);
