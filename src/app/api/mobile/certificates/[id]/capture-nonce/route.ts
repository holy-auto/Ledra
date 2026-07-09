import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { issueCaptureNonce } from "@/lib/certificates/captureNonce";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 撮影時来歴の単回nonceを、既存の証明書に対して払い出す（Option A: 証明書先行フロー）。
 *
 * モバイルは証明書を直 insert で作成するため、cookie 経路の createCertAction のように
 * サーバ側で nonce を発行する箇所が無い。`photo_capture_nonces` は service-role 専用
 * （deny-all RLS）なのでクライアントからは発行できない。この経路が「作成済み証明書 →
 * 単回nonce」の橋渡しを担い、担保撮影（カメラ→multipartアップロード）の前段で呼ばれる。
 *
 * 認可はアップロード経路 (`/api/mobile/certificates/images/upload`) と同一（staff 以上）に
 * 揃える。1撮影セッション=1nonce の前提で、写真アップロード時に添付して cert 束縛の
 * 新鮮な撮影を証明する。
 *
 * 発行失敗（env 欠落等）は fail-open で `capture_nonce: null` を 200 で返す。クライアントは
 * nonce なしでアップロードでき、その場合はベストエフォート（basic）ティアに落ちる。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    // 写真撮影セッションの開始 = アップロードと同じ現場スタッフ以上のゲート。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await params;

    // cert がこのテナントに実在することを RLS スコープで確認（他テナントの cert に
    // nonce を発行させない）。public_id も返し、後続のアップロード呼び出しに使わせる。
    const { data: cert } = await caller.supabase
      .from("certificates")
      .select("id, public_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!cert?.id) return apiNotFound("証明書が見つかりません。");

    const captureNonce = await issueCaptureNonce({ tenantId: caller.tenantId, certificateId: id });

    return apiOk({ capture_nonce: captureNonce, public_id: cert.public_id });
  } catch (e) {
    return apiInternalError(e, "certificates.capture-nonce");
  }
}
