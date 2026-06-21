/**
 * GET /api/signature/body-repair-consent/session/[token]
 *
 * 車体整備 作業前/変更同意ページ表示用のセッション取得 (公開エンドポイント)。
 * 顧客が /sign/consent/[token] を開いた際に呼ばれる。
 * purpose は estimate_consent / change_consent に限定する。
 */

import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  computeConsentTextHash,
  getConsentTextByVersion,
  CONSENT_KIND_LABEL,
  type BodyRepairConsentKind,
} from "@/lib/signature/bodyRepairConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONSENT_PURPOSES = ["estimate_consent", "change_consent"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const supabase = createServiceRoleAdmin(
      "body-repair consent session — opaque token lookup for unauthenticated customer",
    );

    const { data: session, error } = await supabase
      .from("signature_sessions")
      .select(
        `
        id, purpose, status, expires_at, signer_name,
        secondary_factor_required, secondary_factor_verified, secondary_factor_attempts,
        consent_version, consent_text_hash,
        body_repair_consents ( id, kind, explanation_json )
      `,
      )
      .eq("token", token)
      .in("purpose", CONSENT_PURPOSES)
      .single();

    if (error || !session) {
      return apiError({ code: "not_found", message: "同意サインリンクが見つかりません", status: 404 });
    }

    const consentRaw = session.body_repair_consents as unknown;
    const consent = (Array.isArray(consentRaw) ? consentRaw[0] : consentRaw) as {
      id: string;
      kind: BodyRepairConsentKind;
      explanation_json: Record<string, unknown>;
    } | null;
    if (!consent) {
      return apiError({ code: "not_found", message: "同意レコードが見つかりません", status: 404 });
    }

    // 期限切れ
    if (session.status === "pending" && new Date(session.expires_at) < new Date()) {
      await supabase.from("signature_sessions").update({ status: "expired" }).eq("id", session.id);
      await supabase.from("body_repair_consents").update({ status: "expired" }).eq("signature_session_id", session.id);
      await supabase.from("signature_audit_logs").insert({
        session_id: session.id,
        event: "expired",
        ip,
        user_agent: ua,
        metadata: { expired_at: new Date().toISOString() },
      });
      return apiOk({
        status: "expired",
        message: "同意サインリンクの有効期限が切れています。施工店に再送を依頼してください。",
      });
    }

    if (session.status !== "pending") {
      return apiOk({
        status: session.status,
        message:
          session.status === "signed" ? "この同意サインリンクはすでに使用されています" : "無効な同意サインリンクです",
      });
    }

    await supabase.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "page_opened",
      ip,
      user_agent: ua,
      metadata: { opened_at: new Date().toISOString(), purpose: session.purpose },
    });

    // 同意文言の整合性チェック (delivery-receipt と同じ防御)
    const sessionConsentVersion = session.consent_version ?? null;
    const sessionConsentHash = session.consent_text_hash ?? null;
    const lookupText = getConsentTextByVersion(sessionConsentVersion, consent.kind);

    if (!sessionConsentVersion || !sessionConsentHash || !lookupText) {
      return apiError({
        code: "internal_error",
        message: "同意文言情報が見つかりません。施工店にリンクの再発行を依頼してください。",
        status: 500,
      });
    }
    if (computeConsentTextHash(consent.kind) !== sessionConsentHash) {
      return apiError({
        code: "internal_error",
        message: "同意文言の整合性チェックに失敗しました。施工店にリンクの再発行を依頼してください。",
        status: 500,
      });
    }

    return apiOk({
      status: "pending",
      session_id: session.id,
      signer_name: session.signer_name,
      expires_at: session.expires_at,
      secondary_factor_required: session.secondary_factor_required,
      secondary_factor_verified: session.secondary_factor_verified,
      secondary_factor_attempts_left: Math.max(0, 3 - (session.secondary_factor_attempts ?? 0)),
      kind: consent.kind,
      kind_label: CONSENT_KIND_LABEL[consent.kind],
      explanation: consent.explanation_json,
      consent: { version: sessionConsentVersion, text: lookupText, text_hash: sessionConsentHash },
    });
  } catch (e) {
    return apiInternalError(e, "signature/body-repair-consent/session");
  }
}
