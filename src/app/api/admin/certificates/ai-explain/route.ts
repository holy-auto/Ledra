/**
 * POST /api/admin/certificates/ai-explain
 * 証明内容の説明変換（B-2）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateExplanation, type Audience } from "@/lib/ai/explainCertificate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALID_AUDIENCES: Audience[] = ["customer", "insurer", "internal", "sales"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!canUseFeature(caller.planTier, "ai_explain")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    const body = await req.json();
    const { certificate_id, audience } = body as {
      certificate_id?: string;
      audience?: string;
    };

    if (!certificate_id) return apiValidationError("certificate_id が必要です");
    if (!audience || !VALID_AUDIENCES.includes(audience as Audience)) {
      return apiValidationError(`audience は ${VALID_AUDIENCES.join("|")} のいずれかです`);
    }

    const admin = getSupabaseAdmin();

    // 証明書取得
    const { data: cert } = await admin
      .from("certificates")
      .select(
        `
        public_id, service_name, description, material_info,
        warranty_period, created_at, expiry_date, work_areas,
        customer_name, customer_id, vehicle_id, tenant_id
      `,
      )
      .eq("id", certificate_id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound("証明書が見つかりません");

    // テナント（施工店）情報
    const { data: tenant } = await admin.from("tenants").select("name, phone").eq("id", cert.tenant_id).single();

    // 車両情報
    let vehicleInfo: Record<string, string | undefined> = {};
    if (cert.vehicle_id) {
      const { data: v } = await admin
        .from("vehicles")
        .select("maker, model, color, plate_display")
        .eq("id", cert.vehicle_id)
        .single();
      vehicleInfo = v ?? {};
    }

    // 公開URL生成
    const publicUrl = cert.public_id ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${cert.public_id}` : undefined;

    const explanation = await generateExplanation({
      audience: audience as Audience,
      certificate: {
        public_id: cert.public_id ?? "",
        service_name: cert.service_name ?? "",
        description: cert.description ?? undefined,
        material_info: cert.material_info ?? undefined,
        warranty_period: cert.warranty_period ?? undefined,
        issued_at: cert.created_at ?? "",
        expiry_date: cert.expiry_date ?? undefined,
        work_areas: cert.work_areas ?? undefined,
        public_url: publicUrl,
      },
      vehicle: {
        maker: vehicleInfo.maker,
        model: vehicleInfo.model,
        color: vehicleInfo.color,
        plate_display: vehicleInfo.plate_display,
      },
      shop: {
        name: tenant?.name ?? "施工店",
        phone: tenant?.phone ?? undefined,
      },
      customer: { name: cert.customer_name ?? undefined },
    });

    return apiOk({ explanation });
  } catch (e: any) {
    return apiInternalError(e);
  }
}
