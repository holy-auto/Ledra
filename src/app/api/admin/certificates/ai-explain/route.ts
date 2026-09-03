/**
 * POST /api/admin/certificates/ai-explain
 * 証明内容の説明変換（B-2）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateExplanation, type Audience } from "@/lib/ai/explainCertificate";
import { modelForPlanTier } from "@/lib/ai/client";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERT_AI_COLUMNS, certAiFields } from "@/lib/certificates/aiFields";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_AUDIENCES = ["customer", "insurer", "internal", "sales"] as const;

const aiExplainSchema = z.object({
  certificate_id: z.string().uuid("certificate_id が必要です"),
  audience: z.enum(VALID_AUDIENCES, {
    message: `audience は ${VALID_AUDIENCES.join("|")} のいずれかです`,
  }),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_explain")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    // 証明書の説明文生成は呼ぶたびに AI 費用が出る。
    // プラン判定より後に置く。Free のテナントには 429 ではなく案内を返したい。
    const limited = await checkRateLimit(req, "ai", `cert-ai-explain:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = aiExplainSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { certificate_id, audience } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 証明書取得
    const { data: cert } = await admin
      .from("certificates")
      .select(
        `public_id, ${CERT_AI_COLUMNS}, created_at, expiry_date, customer_name, customer_id, vehicle_id, tenant_id`,
      )
      .eq("id", certificate_id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound("証明書が見つかりません");

    // テナント（施工店）情報
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, phone:contact_phone")
      .eq("id", cert.tenant_id)
      .single();

    // 車両情報
    let vehicleInfo: Record<string, string | undefined> = {};
    if (cert.vehicle_id) {
      const { data: v } = await admin
        .from("vehicles")
        .select("maker, model, plate_display")
        .eq("id", cert.vehicle_id)
        .single();
      vehicleInfo = v ?? {};
    }

    // 公開URL生成
    const publicUrl = cert.public_id ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}` : undefined;

    const explanation = await generateExplanation(
      {
        audience: audience satisfies Audience,
        certificate: {
          public_id: cert.public_id ?? "",
          ...certAiFields(cert),
          issued_at: cert.created_at ?? "",
          expiry_date: cert.expiry_date ?? undefined,
          public_url: publicUrl,
        },
        vehicle: {
          maker: vehicleInfo.maker,
          model: vehicleInfo.model,
          plate_display: vehicleInfo.plate_display,
        },
        shop: {
          name: tenant?.name ?? "施工店",
          phone: tenant?.phone ?? undefined,
        },
        customer: { name: cert.customer_name ?? undefined },
      },
      { model: modelForPlanTier(caller.planTier) },
    );

    return apiOk({ explanation });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
