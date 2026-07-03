/**
 * GET /api/admin/reservations/[id]/signoff-state
 *
 * 案件サインオフ・ワークフロー (完了報告 → 証明書 → お客様サイン → お会計 →
 * オンチェーン) の現在状態を 1 回で返す。全業種共通。
 *
 * ここでステップ間の順序ゲート・施工前後写真の充足・24h SLA を計算し、
 * UI (JobSignoffPanel) はこの結果をそのまま描画する。証明書の解決は
 *   1. reservations.ai_certificate_id (自動下書き由来の厳密リンク)
 *   2. 無ければ vehicle_id / customer_id で最新の非 void 証明書
 * の順で行う。
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiError, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { certificateBeforeAfterState } from "@/lib/certificates/photoRequirement";
import { computeSignoffState } from "@/lib/signoff/state";

export const dynamic = "force-dynamic";

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_SIGN_BASE_URL ?? "/sign";
const RECEIPT_SIGN_PATH = `${SIGN_BASE_URL}/receipt`;

type CertRow = { id: string; public_id: string | null; status: string };

/** 案件に紐づく証明書を解決する (厳密リンク優先、無ければ車両/顧客で最新)。 */
async function resolveCertificate(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  reservation: { ai_certificate_id: string | null; vehicle_id: string | null; customer_id: string | null },
): Promise<CertRow | null> {
  if (reservation.ai_certificate_id) {
    const { data } = await admin
      .from("certificates")
      .select("id, public_id, status")
      .eq("id", reservation.ai_certificate_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) return data as CertRow;
  }

  // フォールバック: 手動発行された証明書を車両→顧客の順で最新1件 (void 除外)。
  for (const key of ["vehicle_id", "customer_id"] as const) {
    const val = reservation[key];
    if (!val) continue;
    const { data } = await admin
      .from("certificates")
      .select("id, public_id, status")
      .eq("tenant_id", tenantId)
      .eq(key, val)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as CertRow;
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: reservationId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(reservationId)) {
      return apiError({ code: "validation_error", message: "reservation_id が不正です", status: 400 });
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // signoff_* は本 PR 追加列で生成型に未反映のため、行を明示型にキャストする。
    const { data: resvRaw } = await admin
      .from("reservations")
      .select(
        "id, status, work_completed_at, payment_status, ai_certificate_id, vehicle_id, customer_id, " +
          "signoff_status, signoff_requested_at, signoff_deadline, signed_off_at",
      )
      .eq("id", reservationId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    const resv = resvRaw as unknown as {
      id: string;
      status: string;
      work_completed_at: string | null;
      payment_status: string | null;
      ai_certificate_id: string | null;
      vehicle_id: string | null;
      customer_id: string | null;
      signoff_status: "not_requested" | "awaiting" | "signed" | null;
      signoff_requested_at: string | null;
      signoff_deadline: string | null;
      signed_off_at: string | null;
    } | null;

    if (!resv) {
      return apiError({ code: "not_found", message: "案件(予約)が見つかりません", status: 404 });
    }

    // 証明書 + 施工前後写真
    const cert = await resolveCertificate(admin, caller.tenantId, resv);
    let certState = null as null | {
      id: string;
      public_id: string | null;
      status: string;
      hasBeforePhoto: boolean;
      hasAfterPhoto: boolean;
    };
    if (cert) {
      const ba = await certificateBeforeAfterState(admin, cert.id);
      certState = {
        id: cert.id,
        public_id: cert.public_id,
        status: cert.status,
        hasBeforePhoto: ba.hasBefore,
        hasAfterPhoto: ba.hasAfter,
      };
    }

    // 有効な pending 受領サインリンク (リロード後も表示できるよう live で返す)。
    // reservation_id での紐付けを優先し、無ければ証明書経由でフォールバック。
    let signLink: { url: string; token: string; expires_at: string } | null = null;
    let anchored = false;
    {
      let sessQuery = admin
        .from("signature_sessions")
        .select("token, expires_at, status")
        .eq("tenant_id", caller.tenantId)
        .eq("purpose", "delivery_receipt")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      sessQuery = cert?.id
        ? sessQuery.or(`reservation_id.eq.${reservationId},certificate_id.eq.${cert.id}`)
        : sessQuery.eq("reservation_id", reservationId);
      const { data: sess } = await sessQuery.maybeSingle();
      if (sess && new Date(sess.expires_at) > new Date()) {
        signLink = { url: `${RECEIPT_SIGN_PATH}/${sess.token}`, token: sess.token, expires_at: sess.expires_at };
      }

      // アンカー済み判定: この案件/証明書の受領サインに anchor_tx_hash があるか。
      let recQuery = admin
        .from("delivery_receipts")
        .select("anchor_tx_hash")
        .eq("tenant_id", caller.tenantId)
        .not("anchor_tx_hash", "is", null)
        .limit(1);
      recQuery = cert?.id
        ? recQuery.or(`reservation_id.eq.${reservationId},certificate_id.eq.${cert.id}`)
        : recQuery.eq("reservation_id", reservationId);
      const { data: rec } = await recQuery.maybeSingle();
      anchored = !!rec?.anchor_tx_hash;
    }

    const nowIso = new Date().toISOString();
    const state = computeSignoffState({
      status: resv.status,
      workCompletedAt: resv.work_completed_at,
      certificate: certState,
      signoffStatus: (resv.signoff_status ?? "not_requested") as "not_requested" | "awaiting" | "signed",
      signoffDeadline: resv.signoff_deadline,
      signedOffAt: resv.signed_off_at,
      paymentStatus: resv.payment_status,
      anchored,
      now: nowIso,
    });

    return apiOk({
      reservation_id: reservationId,
      certificate: certState,
      signoff: {
        status: resv.signoff_status ?? "not_requested",
        requested_at: resv.signoff_requested_at,
        deadline: resv.signoff_deadline,
        signed_off_at: resv.signed_off_at,
        overdue: state.overdue,
      },
      payment_status: resv.payment_status,
      sign_link: signLink,
      anchored,
      state,
    });
  } catch (e) {
    return apiInternalError(e, "admin/reservations/[id]/signoff-state");
  }
}
