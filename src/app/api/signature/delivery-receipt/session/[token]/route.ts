/**
 * GET /api/signature/delivery-receipt/session/[token]
 *
 * 受領サインページ表示用のセッション情報取得 API (公開エンドポイント)。
 * 顧客が /sign/receipt/[token] ページを開いた際に呼び出される。
 *
 * 既存の /api/signature/session/[token] と分離している理由:
 *   - 受領サインは purpose='delivery_receipt' に限定して取得する必要がある
 *   - 顧客には電話番号入力 UI を出すための secondary_factor_required を返す
 *   - certificate 本体の署名フローと混在しないようにする
 */

import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { computeConsentTextHash, getConsentTextByVersion } from "@/lib/signature/deliveryReceipt";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // 公開トークン参照 — ブルートフォース対策
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const supabase = createServiceRoleAdmin(
      "delivery receipt session — opaque token lookup for unauthenticated customer",
    );

    const { data: session, error } = await supabase
      .from("signature_sessions")
      .select(
        `
        id,
        purpose,
        status,
        expires_at,
        signer_name,
        secondary_factor_required,
        secondary_factor_verified,
        secondary_factor_attempts,
        consent_version,
        consent_text_hash,
        certificate_id,
        certificates (
          id,
          public_id,
          service_type,
          created_at,
          customer_name,
          vehicles ( plate_display, maker, model ),
          stores   ( name )
        )
      `,
      )
      .eq("token", token)
      .eq("purpose", "delivery_receipt")
      .single();

    if (error || !session) {
      return apiError({ code: "not_found", message: "受領サインリンクが見つかりません", status: 404 });
    }

    // 期限切れ判定
    if (session.status === "pending" && new Date(session.expires_at) < new Date()) {
      await supabase.from("signature_sessions").update({ status: "expired" }).eq("id", session.id);
      await supabase.from("delivery_receipts").update({ status: "expired" }).eq("signature_session_id", session.id);
      await supabase.from("signature_audit_logs").insert({
        session_id: session.id,
        event: "expired",
        ip,
        user_agent: ua,
        metadata: { expired_at: new Date().toISOString() },
      });

      return apiOk({
        status: "expired",
        message: "受領サインリンクの有効期限が切れています。施工店に再送を依頼してください。",
      });
    }

    if (session.status !== "pending") {
      return apiOk({
        status: session.status,
        message:
          session.status === "signed" ? "この受領サインリンクはすでに使用されています" : "無効な受領サインリンクです",
      });
    }

    // page_opened 監査ログ
    await supabase.from("signature_audit_logs").insert({
      session_id: session.id,
      event: "page_opened",
      ip,
      user_agent: ua,
      metadata: { opened_at: new Date().toISOString(), purpose: "delivery_receipt" },
    });

    const cert = session.certificates as unknown as {
      id: string;
      public_id: string;
      service_type: string | null;
      created_at: string;
      customer_name: string | null;
      vehicles: { plate_display: string | null; maker: string | null; model: string | null } | null;
      stores: { name: string } | null;
    } | null;

    // 同意文言は依頼発行時点でセッションに binding 済みのバージョン/ハッシュを返す。
    // グローバル定数を直接返すと、コード上で文言を更新したあとに在中の古いリンクに
    // 新文言が表示されてしまい、署名対象の hash と表示テキストが乖離する (Codex P2)。
    const sessionConsentVersion = session.consent_version ?? null;
    const sessionConsentHash = session.consent_text_hash ?? null;
    const lookupText = getConsentTextByVersion(sessionConsentVersion);

    // 整合性チェック: コード上の文言エントリと、セッション保存時の hash が一致しないと
    //   - 文言定数を編集したのに version をバンプし忘れた、または
    //   - DB が改ざんされた
    // のいずれか。表示してしまうと署名対象との乖離が発生するので 500 で止める。
    if (!sessionConsentVersion || !sessionConsentHash || !lookupText) {
      console.error(
        "[delivery-receipt/session] consent metadata missing on session",
        session.id,
        sessionConsentVersion,
      );
      return apiError({
        code: "internal_error",
        message: "同意文言情報が見つかりません。施工店にリンクの再発行を依頼してください。",
        status: 500,
      });
    }
    if (computeConsentTextHash(lookupText) !== sessionConsentHash) {
      console.error("[delivery-receipt/session] consent text hash drift", session.id, sessionConsentVersion);
      return apiError({
        code: "internal_error",
        message:
          "同意文言の整合性チェックに失敗しました (バージョン未バンプの可能性)。施工店にリンクの再発行を依頼してください。",
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
      pdf_url: cert?.public_id ? `/api/certificate/pdf?pid=${encodeURIComponent(cert.public_id)}` : null,
      certificate: cert
        ? {
            id: cert.id,
            public_id: cert.public_id,
            // cert_type 列は certificates に無い。種別は service_type が持つ
            cert_type: null,
            service_type: cert.service_type,
            created_at: cert.created_at,
            customer_name: cert.customer_name,
            vehicles: cert.vehicles,
            stores: cert.stores,
          }
        : null,
      consent: {
        version: sessionConsentVersion,
        text: lookupText,
        text_hash: sessionConsentHash,
      },
    });
  } catch (e) {
    return apiInternalError(e, "signature/delivery-receipt/session");
  }
}
