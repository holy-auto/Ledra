import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { evaluateCertificateActivationGate, firstGateFailureMessage } from "@/lib/certificates/activationGate";
import { certificateMileageKm, CERTIFICATE_MILEAGE_REQUIRED_MESSAGE } from "@/lib/maintenance/mileage";
import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Activate certificate (draft → active) ───
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:edit")) return apiForbidden();

    const { id } = await params;

    const { data: cert } = await caller.supabase
      .from("certificates")
      .select(
        "id, status, public_id, customer_id, customer_name, vehicle_info_json, service_type, created_by, reservation_id, maintenance_json",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound();
    if (cert.status !== "draft") {
      return apiValidationError(`Cannot activate: current status is "${cert.status}", expected "draft"`);
    }

    // Certificate Gate (IMP-028, ADR-0005): 単一評価器を通す (写真必須・懸念未解決なし・部品整合性 等)。
    const certGate = await evaluateCertificateActivationGate(caller.supabase, {
      certificateId: id,
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

    const { data, error } = await caller.supabase
      .from("certificates")
      .update({ status: "active" })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, public_id, vehicle_id, tenant_id, status, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "certificates.activate");

    // Audit log
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "certificate_activated",
      table: "certificates",
      recordId: id,
      targetPublicId: cert.public_id as string,
      req: request,
    });

    // 初回発行 (draft→active) の副作用 (保険案件 enqueue / フォローアップ) を発火。
    const vinfo = (cert.vehicle_info_json ?? {}) as { model?: string; plate?: string };
    triggerCertificateIssued({
      tenantId: caller.tenantId,
      publicId: cert.public_id as string,
      certificateId: id,
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

    return apiOk({ certificate: data });
  } catch (e) {
    return apiInternalError(e, "certificates.activate");
  }
}
