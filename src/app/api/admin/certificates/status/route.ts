import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { resolveCallerWithRole, requireMinRole, requirePermission } from "@/lib/auth/checkRole";
import { evaluateCertificateActivationGate, firstGateFailureMessage } from "@/lib/certificates/activationGate";
import { certificateMileageKm, CERTIFICATE_MILEAGE_REQUIRED_MESSAGE } from "@/lib/maintenance/mileage";
import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { getActorAssurance } from "@/lib/auth/mfa";
import { describeAssurance } from "@/lib/certificates/issuerAssurance";
import { requireOperationAssertion } from "@/lib/webauthn/gate";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["active", "void", "draft"] as const;
type CertStatus = (typeof VALID_STATUSES)[number];

const certStatusSchema = z.object({
  public_id: z.string().trim().min(1, "public_id は必須です。"),
  status: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(VALID_STATUSES, { message: "status は active / void / draft のいずれかを指定してください。" })),
  // WebAuthn 操作署名(WEBAUTHN_OPERATION_SIGNING=optional|enforce のとき使用)。
  webauthn_challenge_id: z.string().uuid().optional(),
});

/**
 * Allowed status transitions:
 *  draft  -> active  (staff+)
 *  active -> void    (certificates:void = admin+)
 *  void   -> active  (admin+ only)
 *
 * 無効化 (→void) はロール下限ではなく Permission で判定する。証明書の無効化は
 * 不可逆で法的意味を持つ操作 (operationRisk = critical) であり、無効化の経路は
 * これを含めて5本ある。ロール下限と Permission の二本立てにすると経路ごとに
 * ズレる (実際、ここだけ staff で通り、他4経路は admin 以上を要求していた)。
 * 登録は API_ROUTE_PERMISSIONS、強制は apiRoutePermissions.test.ts。
 */
const TRANSITIONS: Record<string, { to: CertStatus; minRole: "staff" | "admin" }[]> = {
  draft: [{ to: "active", minRole: "staff" }],
  active: [{ to: "void", minRole: "admin" }],
  void: [{ to: "active", minRole: "admin" }],
};

/**
 * PUT /api/admin/certificates/status
 * Body: { public_id: string, status: "active" | "void" | "draft" }
 */
export async function PUT(req: Request) {
  try {
    const parsed = certStatusSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { public_id: publicId, status: newStatus } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Base minimum role: staff
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch current certificate (scoped to caller's tenant)
    const { data: cert, error: fetchErr } = await admin
      .from("certificates")
      .select(
        "id, vehicle_id, status, customer_id, customer_name, vehicle_info_json, service_type, created_by, reservation_id, maintenance_json",
      )
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .limit(1)
      .maybeSingle();

    if (fetchErr || !cert) {
      return apiNotFound("証明書が見つかりません。");
    }

    const currentStatus = String(cert.status ?? "").toLowerCase() as CertStatus;

    // Already in the target status
    if (currentStatus === newStatus) {
      return apiOk({ already: true, status: newStatus });
    }

    // Check if transition is allowed
    const allowed = TRANSITIONS[currentStatus];
    const transition = allowed?.find((t) => t.to === newStatus);
    if (!transition) {
      return apiValidationError(`ステータス遷移 ${currentStatus} → ${newStatus} は許可されていません。`);
    }

    // Check the role required for this specific transition
    if (!requireMinRole(caller, transition.minRole)) {
      return apiForbidden(`${currentStatus} → ${newStatus} の遷移には ${transition.minRole} 以上の権限が必要です。`);
    }

    // 無効化は他4経路と同じ Permission で判定する（ロール下限とは別軸で二重に縛る）。
    if (newStatus === "void" && !requirePermission(caller, "certificates:void")) {
      return apiForbidden("証明書無効化の権限がありません。");
    }

    // Certificate Gate (IMP-028, ADR-0005): active 化 (draft→active / void→active) は
    // 単一評価器を通す (写真必須・懸念未解決なし・部品整合性 等)。
    if (newStatus === "active") {
      const certGate = await evaluateCertificateActivationGate(admin, {
        certificateId: cert.id as string,
        tenantId: caller.tenantId,
        serviceType: cert.service_type as string | null,
        reservationId: (cert.reservation_id as string | null) ?? null,
      });
      if (!certGate.ready) {
        return apiValidationError(firstGateFailureMessage(certGate));
      }
      // 走行距離必須ルール: 発行の瞬間に一度だけ強制する。作成経路 (Web / モバイル /
      // 外部 API / AI 自動起票) は増減するが、active になる道は 3 本しかないため、
      // そこを塞げば漏れが出ない (activationGates.test.ts が数え漏れを検出する)。
      //
      // ただし **初回発行 (draft→active) のみ**。void→active の再発行にも掛けると、
      // 必須化より前に作られた走行距離なしの証明書を void した瞬間、二度と戻せなくなる
      // (編集フォームは void 中は出ないので入力する窓口が無い)。再発行は「以前発行した
      // 内容を戻す」操作なので、そこで新たに走行距離を要求する意味も無い。
      if (currentStatus === "draft" && certificateMileageKm(cert.maintenance_json) === null) {
        return apiValidationError(CERTIFICATE_MILEAGE_REQUIRED_MESSAGE);
      }
    }

    // WebAuthn 操作署名ゲート。WEBAUTHN_OPERATION_SIGNING=off(既定)では即 ok=true で
    // 本番挙動は不変。optional/enforce のときのみ、登録済み認証器での署名(operation/verify で
    // 記録済みの assertion)を要求し、チャレンジを単回消費する。→active は 'finalize'、→void は 'void'。
    const opType = newStatus === "void" ? "void" : "finalize";
    const gate = await requireOperationAssertion(admin, {
      userId: caller.userId,
      tenantId: caller.tenantId,
      operationType: opType,
      certificateId: cert.id as string,
      challengeId: parsed.data.webauthn_challenge_id ?? null,
    });
    if (!gate.ok) return apiForbidden(gate.reason ?? "この操作には操作署名が必要です。");

    // Perform the update via admin client (bypasses RLS)
    const { data: updated, error: updateErr } = await admin
      .from("certificates")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .select("id, public_id, status, vehicle_id, customer_id, created_at, updated_at")
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "admin/certificates/status update");
    }

    // Audit log (fire-and-forget)
    const { ip, userAgent } = getRequestMeta(req);
    const auditType = newStatus === "void" ? "certificate_voided" : "certificate_issued";
    let description = `ステータス変更: ${currentStatus} → ${newStatus}`;
    // 発行 (→active) は「誰が・どの本人性強度で発行したか」を監査へ残す
    // (roadmap 4-14: パスキー等の強い本人性を発行の証跡に紐づける)。
    // 取得失敗は "不明" になるだけで発行はブロックしない (getActorAssurance 内で吸収)。
    if (newStatus === "active") {
      const assurance = await getActorAssurance(supabase);
      description += ` (発行者の本人性: ${describeAssurance(assurance)})`;
    }
    // 操作署名(パスキー)で承認された操作はその旨を監査へ残す。
    if (gate.assurance === "passkey") description += " [操作署名: パスキー]";
    logCertificateAction({
      type: auditType,
      tenantId: caller.tenantId,
      publicId,
      certificateId: cert.id,
      vehicleId: cert.vehicle_id ?? null,
      userId: caller.userId,
      description,
      ip,
      userAgent,
    });

    // 初回発行 (draft→active) のみ発行副作用を発火する。void→active の再発行では
    // 二重通知を避けるため発火しない。
    if (currentStatus === "draft" && newStatus === "active") {
      const vinfo = (cert.vehicle_info_json ?? {}) as { model?: string; plate?: string };
      triggerCertificateIssued({
        tenantId: caller.tenantId,
        publicId,
        certificateId: cert.id as string,
        customerName: (cert.customer_name as string | null) ?? "",
        customerId: (cert.customer_id as string | null) ?? null,
        vehicleModel: vinfo.model ?? null,
        vehiclePlate: vinfo.plate ?? null,
        serviceType: (cert.service_type as string | null) ?? null,
        createdBy: (cert.created_by as string | null) ?? caller.userId,
        reservationId: (cert.reservation_id as string | null) ?? null,
      }).catch(() => {
        /* fire-and-forget: issueHooks 内で log 済み */
      });
    }

    // draft→active 以外の状態遷移 (void 化 / 再発行 等) でも証明書レコードの新しい
    // digest を anchor queue に積む (draft→active は上の issueHooks 側で enqueue 済み)。
    if (!(currentStatus === "draft" && newStatus === "active")) {
      // best-effort fire-and-forget (triggerCertificateIssued と同様)。enqueue は throw しない。
      enqueueCertificateAnchor({ tenantId: caller.tenantId, certificateId: cert.id as string }).catch(() => {});
    }

    return apiOk({ certificate: updated });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/status");
  }
}
