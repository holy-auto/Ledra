/**
 * cert_idempotency_keys 永続マッピングのアクセサ。
 *
 * cert 作成 (JSON POST) 成功直後に書き込み、画像 upload エンドポイントが
 * `cert_idempotency_key` form field から public_id を逆引きする際に使う。
 *
 * Redis 側 idempotency cache (`withIdempotency`) は callerId(IP) を含むキーで
 * 24h TTL。本マッピングはそれと独立した永続層で、IP 変更や 24h 以上の
 * オフライン期間にも耐える (TTL 30 日)。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface CertIdempotencyRecord {
  idempotency_key: string;
  tenant_id: string;
  certificate_id: string;
  public_id: string;
}

/**
 * 新規 cert 作成成功時に冪等キーマッピングを記録する。
 * 同一 key 再投入時 (オフライン再送) は UNIQUE 違反 (23505) で先勝ち。
 */
export async function recordCertIdempotency(rec: CertIdempotencyRecord): Promise<{ ok: boolean }> {
  const admin = createServiceRoleAdmin("cert idempotency map insert — offline cert/photo reconciliation");
  try {
    const { error } = await admin.from("cert_idempotency_keys").insert({
      idempotency_key: rec.idempotency_key,
      tenant_id: rec.tenant_id,
      certificate_id: rec.certificate_id,
      public_id: rec.public_id,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        // 並行先勝ち。OK
        return { ok: true };
      }
      logger.warn("[cert-idem-map] insert failed", {
        tenantId: rec.tenant_id,
        err: error.message,
      });
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    logger.warn("[cert-idem-map] insert threw", {
      tenantId: rec.tenant_id,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

/**
 * idempotency-key から cert (public_id) を逆引きする。
 * 画像 upload エンドポイントから呼び、見つからなければ null。
 *
 * tenant スコープ必須。クロステナント漏洩防止のため呼び出し元の
 * tenantId と一致する行のみ返す。
 */
export async function lookupCertByIdempotencyKey(
  key: string,
  tenantId: string,
): Promise<{ public_id: string; certificate_id: string } | null> {
  if (!key || !tenantId) return null;
  const admin = createServiceRoleAdmin("cert idempotency map lookup — offline photo upload");
  try {
    const { data, error } = await admin
      .from("cert_idempotency_keys")
      .select("public_id, certificate_id")
      .eq("idempotency_key", key)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      logger.warn("[cert-idem-map] lookup failed", { tenantId, err: error.message });
      return null;
    }
    if (!data) return null;
    return {
      public_id: data.public_id as string,
      certificate_id: data.certificate_id as string,
    };
  } catch (e) {
    logger.warn("[cert-idem-map] lookup threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
