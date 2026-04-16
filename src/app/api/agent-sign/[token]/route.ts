/**
 * /api/agent-sign/[token]
 *
 * 代理店契約書 公開署名 API（認証不要・トークン認証）
 *
 * GET  : トークンから契約書情報を返す（署名ページ表示用）
 * POST : 電子署名を実行して agent_signing_requests を更新する
 *
 * 署名ペイロード形式:
 *   "ledra-agent-contract-v1:{request_id}:{template_type}:{signed_at}:{signer_email}"
 *
 * 電子署名法（平成12年法律第102号）第2条準拠:
 *   - 本人性: signer_email + signer_ip + signer_user_agent の記録
 *   - 非改ざん性: ペイロードを ECDSA P-256 で署名し、サーバー秘密鍵で保護
 */

import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";
import { getAdminClient } from "@/lib/api/auth";
import { apiInternalError } from "@/lib/api/response";
import { getPrivateKey, getActiveKeyInfo } from "@/lib/signature/crypto";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ token: string }> };

const TEMPLATE_LABELS: Record<string, string> = {
  agent_contract: "代理店契約書",
  nda: "秘密保持契約（NDA）",
  other: "その他",
};

/** 署名ペイロードを構築する */
function buildAgentContractPayload(
  requestId: string,
  templateType: string,
  signedAt: string,
  signerEmail: string,
): string {
  return [
    "ledra-agent-contract-v1",
    requestId.toLowerCase(),
    templateType.toLowerCase(),
    signedAt,
    signerEmail.toLowerCase().trim(),
  ].join(":");
}

/** ECDSA P-256 署名 */
function signPayload(payload: string, privateKey: string): string {
  const sign = createSign("SHA256");
  sign.update(payload, "utf8");
  sign.end();
  return sign.sign(privateKey, "base64");
}

// ── GET ──────────────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params;
    const admin = getAdminClient();

    const { data: record, error } = await admin
      .from("agent_signing_requests")
      .select(
        "id, template_type, title, status, signer_name, signer_email, sign_expires_at",
      )
      .eq("sign_token", token)
      .single();

    if (error || !record) {
      return NextResponse.json(
        { status: "not_found", message: "署名リンクが見つかりません" },
        { status: 404 },
      );
    }

    // 期限チェック
    if (record.sign_expires_at && new Date(record.sign_expires_at) < new Date()) {
      return NextResponse.json({ status: "expired" }, { status: 200 });
    }

    if (record.status === "signed") {
      return NextResponse.json({ status: "already_signed" }, { status: 200 });
    }

    if (record.status === "expired") {
      return NextResponse.json({ status: "expired" }, { status: 200 });
    }

    return NextResponse.json({
      status: "pending",
      request_id: record.id,
      template_type: record.template_type,
      template_label: TEMPLATE_LABELS[record.template_type] ?? record.template_type,
      title: record.title,
      signer_name: record.signer_name,
      expires_at: record.sign_expires_at,
    });
  } catch (e) {
    return apiInternalError(e, "agent-sign GET");
  }
}

// ── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { token } = await ctx.params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    let body: { signer_email: string; agreed: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "リクエストが不正です" }, { status: 400 });
    }

    const { signer_email, agreed } = body;

    if (!agreed) {
      return NextResponse.json({ message: "内容に同意してください" }, { status: 400 });
    }
    if (!signer_email?.includes("@") || signer_email.length > 254) {
      return NextResponse.json(
        { message: "有効なメールアドレスを入力してください" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // トークンで記録を取得
    const { data: record, error: fetchErr } = await admin
      .from("agent_signing_requests")
      .select("id, template_type, title, status, sign_expires_at")
      .eq("sign_token", token)
      .single();

    if (fetchErr || !record) {
      return NextResponse.json(
        { message: "署名リンクが見つかりません" },
        { status: 404 },
      );
    }

    if (record.sign_expires_at && new Date(record.sign_expires_at) < new Date()) {
      return NextResponse.json({ message: "署名リンクの有効期限が切れています" }, { status: 400 });
    }

    if (record.status === "signed") {
      return NextResponse.json({ message: "この契約書はすでに署名されています" }, { status: 400 });
    }

    if (!["sent", "viewed"].includes(record.status)) {
      return NextResponse.json({ message: "署名できない状態の契約書です" }, { status: 400 });
    }

    const signedAt = new Date().toISOString();
    const normalizedEmail = signer_email.toLowerCase().trim();

    // 署名ペイロードと ECDSA P-256 署名
    const payload = buildAgentContractPayload(
      record.id,
      record.template_type,
      signedAt,
      normalizedEmail,
    );

    let signature: string;
    let keyInfo: { version: string; fingerprint: string };
    try {
      const privateKey = getPrivateKey();
      signature = signPayload(payload, privateKey);
      keyInfo = getActiveKeyInfo();
    } catch (err) {
      console.error("[agent-sign] Signing failed:", err);
      return NextResponse.json({ message: "署名処理中にエラーが発生しました" }, { status: 500 });
    }

    // 署名証跡を保存（status = 'pending' の楽観的ロックで二重署名防止）
    const { error: updateErr } = await admin
      .from("agent_signing_requests")
      .update({
        status: "signed",
        signed_at: signedAt,
        signer_ip: ip,
        signer_user_agent: ua,
        signature,
        signing_payload: payload,
        public_key_fingerprint: keyInfo.fingerprint,
        key_version: keyInfo.version,
        sign_token: null,  // トークン無効化（再利用防止）
        updated_at: signedAt,
      })
      .eq("id", record.id)
      .in("status", ["sent", "viewed"]);  // 二重署名防止

    if (updateErr) {
      console.error("[agent-sign] DB update failed:", updateErr);
      return NextResponse.json({ message: "署名の保存中にエラーが発生しました" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      signed_at: signedAt,
      session_id: record.id,
      signature_preview: signature.slice(0, 20) + "...",
    });
  } catch (e) {
    return apiInternalError(e, "agent-sign POST");
  }
}
