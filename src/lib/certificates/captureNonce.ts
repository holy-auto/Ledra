/**
 * photo_capture_nonces アクセサ — 撮影時来歴の「新鮮さ」を担保する単回nonce。
 *
 * cert 作成時に {@link issueCaptureNonce} でサーバ発行し、写真アップロード時に
 * {@link consumeCaptureNonce} で cert+tenant 束縛のもと原子的に単回消費する。
 * 消費は行ロック RPC (consume_photo_capture_nonce) に閉じており、並行アップロードの
 * 二重消費・別 cert 流用・期限切れ・リプレイをサーバ側で弾く。
 *
 * cert_idempotency_keys / idempotencyMap.ts と同じ「service-role 書き込み・
 * tenant スコープ・fail-safe」規約に倣う。
 */

import { randomBytes } from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** RPC consume_photo_capture_nonce の戻り値。'ok' 以外は非担保（nonceOk=false）。 */
export type ConsumeNonceResult = "ok" | "consumed" | "expired" | "mismatch" | "not_found" | "error";

/**
 * cert 作成成功時に単回撮影nonceを発行して返す。失敗しても cert 作成は止めない
 * (null を返す = そのテナントは当面 basic 止まり)。
 */
export async function issueCaptureNonce(params: { tenantId: string; certificateId: string }): Promise<string | null> {
  const { tenantId, certificateId } = params;
  if (!tenantId || !certificateId) return null;
  // 128bit のランダム nonce。衝突は現実的に無く、PK 重複時は素直に失敗させる。
  const nonce = randomBytes(16).toString("hex");
  try {
    // service-role client 初期化 (env 欠落等) も try 内に置く。cert 作成の後に
    // 呼ばれるため、ここで throw すると作成アクションごと 500 になる。fail-open で null。
    const admin = createServiceRoleAdmin("photo capture nonce issue — cert create");
    const { error } = await admin.from("photo_capture_nonces").insert({
      nonce,
      tenant_id: tenantId,
      certificate_id: certificateId,
    });
    if (error) {
      logger.warn("[capture-nonce] issue failed", { tenantId, err: error.message });
      return null;
    }
    return nonce;
  } catch (e) {
    logger.warn("[capture-nonce] issue threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * 撮影nonceを cert+tenant 束縛で原子的に単回消費する。
 * fail-closed: RPC エラー時は 'error' を返し、呼び出し側は nonceOk=false として扱う。
 *
 * @param deviceKeyHash 端末アテステーション鍵のハッシュ（監査/リプレイ検知用に記録）。
 */
export async function consumeCaptureNonce(params: {
  nonce: string;
  tenantId: string;
  certificateId: string;
  deviceKeyHash?: string | null;
}): Promise<ConsumeNonceResult> {
  const { nonce, tenantId, certificateId, deviceKeyHash } = params;
  if (!nonce || !tenantId || !certificateId) return "not_found";
  try {
    // service-role client 初期化も try 内に置き、失敗は fail-closed で 'error' に。
    const admin = createServiceRoleAdmin("photo capture nonce consume — image upload");
    const { data, error } = await admin.rpc("consume_photo_capture_nonce", {
      p_nonce: nonce,
      p_tenant_id: tenantId,
      p_certificate_id: certificateId,
      p_device_key_hash: deviceKeyHash ?? null,
    });
    if (error) {
      logger.warn("[capture-nonce] consume RPC failed", { tenantId, err: error.message });
      return "error";
    }
    const result = typeof data === "string" ? (data as ConsumeNonceResult) : "error";
    return result;
  } catch (e) {
    logger.warn("[capture-nonce] consume threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return "error";
  }
}
