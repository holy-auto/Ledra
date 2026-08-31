import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { lookupCertByIdempotencyKey } from "@/lib/certificates/idempotencyMap";
import { evaluateCertificateActivationGate, firstGateFailureMessage } from "@/lib/certificates/activationGate";
import { certificateMileageKm, CERTIFICATE_MILEAGE_REQUIRED_MESSAGE } from "@/lib/maintenance/mileage";
import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const schema = z.object({
  cert_idempotency_key: z.string().trim().min(8, "cert_idempotency_key が不正です。").max(200),
});

/**
 * POST /api/certificates/activate-by-key
 *
 * オフライン経路専用の発行 (draft→active) エンドポイント。クライアントは
 * 作成時の `idempotency-key` を保持しており、写真アップロード完了後に同 key で
 * 証明書を逆引きして発行する (public_id はサーバ採番のため、オフライン時点では
 * クライアントが知らない)。
 *
 * 写真添付必須ルールはここでもサーバ強制する。
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const found = await lookupCertByIdempotencyKey(parsed.data.cert_idempotency_key, caller.tenantId);
    if (!found) return apiNotFound("証明書が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: cert, error: fetchErr } = await admin
      .from("certificates")
      .select(
        "id, public_id, status, vehicle_id, customer_id, customer_name, vehicle_info_json, service_type, created_by, reservation_id, maintenance_json",
      )
      .eq("tenant_id", caller.tenantId)
      .eq("id", found.certificate_id)
      .maybeSingle();

    if (fetchErr || !cert) return apiNotFound("証明書が見つかりません。");

    const currentStatus = String(cert.status ?? "").toLowerCase();
    // 冪等: 既に発行済みなら成功扱い (outbox 再送に耐える)
    if (currentStatus === "active") {
      return apiOk({ already: true, public_id: cert.public_id, status: "active" });
    }
    if (currentStatus !== "draft") {
      return apiValidationError(`発行できません: 現在のステータスは "${currentStatus}" です。`);
    }

    // Certificate Gate (IMP-028, ADR-0005): 単一評価器を通す (写真必須・懸念未解決なし・部品整合性 等)。
    const certGate = await evaluateCertificateActivationGate(admin, {
      certificateId: cert.id as string,
      tenantId: caller.tenantId,
      serviceType: cert.service_type as string | null,
      reservationId: (cert.reservation_id as string | null) ?? null,
    });
    if (!certGate.ready) {
      return apiValidationError(firstGateFailureMessage(certGate));
    }

    // 走行距離必須ルール (発行の 3 経路すべてで同じ判定)。
    if (certificateMileageKm(cert.maintenance_json) === null) {
      return apiValidationError(CERTIFICATE_MILEAGE_REQUIRED_MESSAGE);
    }

    const { data: updated, error: updateErr } = await admin
      .from("certificates")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("tenant_id", caller.tenantId)
      .eq("id", cert.id)
      .select("id, public_id, status, vehicle_id, created_at, updated_at")
      .single();

    if (updateErr) return apiInternalError(updateErr, "certificates/activate-by-key update");

    const { ip, userAgent } = getRequestMeta(req);
    logCertificateAction({
      type: "certificate_issued",
      tenantId: caller.tenantId,
      publicId: cert.public_id as string,
      certificateId: cert.id as string,
      vehicleId: (cert.vehicle_id as string | null) ?? null,
      userId: caller.userId,
      description: "ステータス変更: draft → active (offline activate)",
      ip,
      userAgent,
    });

    const vinfo = (cert.vehicle_info_json ?? {}) as { model?: string; plate?: string };
    triggerCertificateIssued({
      tenantId: caller.tenantId,
      publicId: cert.public_id as string,
      certificateId: cert.id as string,
      customerName: (cert.customer_name as string | null) ?? "",
      customerId: (cert.customer_id as string | null) ?? null,
      vehicleModel: vinfo.model ?? null,
      vehiclePlate: vinfo.plate ?? null,
      serviceType: (cert.service_type as string | null) ?? null,
      createdBy: (cert.created_by as string | null) ?? caller.userId,
      reservationId: (cert.reservation_id as string | null) ?? null,
    }).catch(() => {
      /* fire-and-forget */
    });

    return apiOk({ certificate: updated });
  } catch (e) {
    return apiInternalError(e, "certificates/activate-by-key");
  }
}
