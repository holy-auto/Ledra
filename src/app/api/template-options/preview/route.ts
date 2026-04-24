import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { templateConfigSchema } from "@/lib/template-options/configSchema";
import { getTemplateOptionStatus, TEST_ISSUE_LIMITS } from "@/lib/template-options/templateOptionFeatures";
import { renderBrandedCertificatePdf } from "@/lib/template-options/renderBrandedCertificate";
import type { CertRow } from "@/lib/pdfCertificate";
import type { TemplateConfig } from "@/types/templateOption";

const previewSchema = z.object({
  config: templateConfigSchema,
});

// ダミーの証明書データ（プレビュー用）
const PREVIEW_CERT: CertRow = {
  public_id: "PREVIEW-0001",
  customer_name: "山田 太郎",
  vehicle_info_json: { model: "トヨタ クラウン", plate: "品川 300 あ 1234", year: 2024 },
  content_free_text: null,
  content_preset_json: {
    schema_snapshot: {
      version: 1,
      sections: [
        {
          title: "コーティング",
          fields: [
            { key: "coating_brand", label: "ブランド", type: "select" },
            { key: "coating_type", label: "種類", type: "text" },
          ],
        },
      ],
    },
    values: {
      coating_brand: "LUMINUS",
      coating_type: "ガラスコーティング 5層",
    },
  },
  expiry_type: "期間",
  expiry_value: "施工日から5年間",
  logo_asset_path: null,
  created_at: new Date().toISOString(),
};

/** POST: テンプレート設定でプレビューPDFを生成 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const optionStatus = await getTemplateOptionStatus(caller.tenantId);
    if (!optionStatus.hasSubscription) {
      return apiForbidden("テンプレートオプションの契約が必要です。");
    }

    // テスト発行回数制限チェック
    const limit = TEST_ISSUE_LIMITS[optionStatus.optionType!];
    const { admin } = (await import("@/lib/supabase/admin")).createTenantScopedAdmin(caller.tenantId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await admin
      .from("template_order_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "test_issue")
      .gte("created_at", monthStart.toISOString())
      .in(
        "order_id",
        (await admin.from("template_orders").select("id").eq("tenant_id", caller.tenantId)).data?.map(
          (o: any) => o.id,
        ) ?? [],
      );

    const usedCount = count ?? 0;
    if (usedCount >= limit) {
      return apiForbidden(`今月のテスト発行上限（${limit}回）に達しています。来月までお待ちください。`);
    }

    // テスト発行ログ記録（オーダーがあれば）
    const { data: latestOrder } = await admin
      .from("template_orders")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOrder) {
      await admin.from("template_order_logs").insert({
        order_id: latestOrder.id,
        action: "test_issue",
        actor: caller.userId,
        message: `テスト発行 (${usedCount + 1}/${limit})`,
      });
    }

    const config = parsed.data.config as TemplateConfig;
    const previewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com"}/c/PREVIEW-0001`;

    const pdfBuffer = await renderBrandedCertificatePdf(PREVIEW_CERT, previewUrl, config);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
      },
    });
  } catch (e) {
    return apiInternalError(e, "template-options/preview");
  }
}
