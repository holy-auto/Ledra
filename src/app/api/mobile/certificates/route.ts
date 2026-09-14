import { NextRequest } from "next/server";

import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { withIdempotency } from "@/lib/api/idempotency";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { certCreateJsonSchema, jsonToCertFormData } from "@/lib/certificates/createCertificateApi";
import { createCertificate } from "@/lib/certificates/create";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { recordCertIdempotency } from "@/lib/certificates/idempotencyMap";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST: 証明書の作成（モバイルアプリ用 Bearer Token 認証）
 *
 * なぜ要るか: モバイルは `certificates` へ直接 insert していたため、
 * テンプレートのスキーマ写し取り・メーカー認定テンプレートの検証・撮影来歴の
 * nonce 発行・車両履歴の記録を**まるごと飛ばしていた**。Web と同じ
 * `createCertificate()` を通す。
 */
export async function POST(req: NextRequest) {
  const rawIdemKey = req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key");

  return withIdempotency(req, "mobile:cert:create", async () => {
    try {
      const caller = await resolveMobileCaller(req);
      if (!caller) return apiUnauthorized();

      // 証明書の発行は staff 以上。viewer には作らせない
      if (!requireMinRole(caller, "staff")) return apiForbidden();

      // 書き込み系の既定 preset（60 req/60s）。専用 preset は作らない
      const limited = await checkRateLimit(req, "admin_write", caller.userId);
      if (limited) return limited;

      const parsed = certCreateJsonSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const result = await createCertificate(caller.supabase, caller, jsonToCertFormData(parsed.data));
      if (!result.ok) {
        if (result.error === "unauthorized") return apiUnauthorized();
        return apiValidationError(result.error);
      }

      // 端末の詳細画面は id（uuid）で引くので、public_id から引き直して返す
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: cert } = await admin
        .from("certificates")
        .select("id, tenant_id")
        .eq("public_id", result.public_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();

      // 写真のオフラインアップロードが public_id を逆引きできるように、
      // idempotency-key と証明書の対応を残す（Web の作成 API と同じ）
      if (rawIdemKey && rawIdemKey.length >= 8 && cert) {
        try {
          await recordCertIdempotency({
            idempotency_key: rawIdemKey,
            tenant_id: cert.tenant_id as string,
            certificate_id: cert.id as string,
            public_id: result.public_id,
          });
        } catch (e) {
          // 対応の記録に失敗しても証明書は作成済み。ここで止めない
          logger.warn("mobile/certificates POST: idempotency map record failed", {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return apiJson({
        ok: true,
        id: (cert?.id as string | undefined) ?? null,
        public_id: result.public_id,
        capture_nonce: result.capture_nonce,
        photo_required: result.photo_required,
      });
    } catch (e: unknown) {
      return apiInternalError(e, "mobile/certificates POST");
    }
  }) as Promise<Response>;
}
