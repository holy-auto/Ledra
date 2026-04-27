/**
 * GET /api/cron/encrypt-secrets-backfill
 *
 * STEP 2 / 3: 既存の平文列に保存されている機微情報を暗号化列にバックフィル
 * する一回限りの cron。idempotent なので何度走らせても安全。
 *
 * 対象テーブル / 列の詳細は src/lib/crypto/backfillSecrets.ts 参照。
 *
 * 認証: verifyCronRequest (Vercel cron 署名 or `Bearer $CRON_SECRET`)
 *
 * 同等の処理を管理者画面から叩くには
 * `POST /api/admin/platform/encrypt-secrets-backfill` を使う (session 認証)。
 *
 * 失敗モード:
 *   - SECRET_ENCRYPTION_KEY 未設定 → 早期に skipped で終了。
 *   - 個別行の暗号化失敗 → エラーをログに残し、その行はスキップして次へ。
 */
import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { hasEncryptionKey } from "@/lib/crypto/secretBox";
import { backfillTenants, backfillSquareConnections } from "@/lib/crypto/backfillSecrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_TIMEOUT_MS = 55_000;
const LOCK_TTL_SECONDS = 600;

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const { authorized, error: authError } = verifyCronRequest(req);
    if (!authorized) return apiUnauthorized(authError);

    if (!hasEncryptionKey()) {
      console.warn("[encrypt-backfill] SECRET_ENCRYPTION_KEY is not configured — skipping");
      return apiOk({
        skipped: true,
        reason: "SECRET_ENCRYPTION_KEY is not configured",
      });
    }

    const admin = createServiceRoleAdmin(
      "cron:encrypt-secrets-backfill — encrypts plaintext tenant secrets across every tenant",
    );

    const result = await withCronLock(admin, "encrypt-secrets-backfill", LOCK_TTL_SECONDS, async () => {
      const tenants = await backfillTenants(admin, { startTime, timeoutMs: CRON_TIMEOUT_MS });
      const square = await backfillSquareConnections(admin, { startTime, timeoutMs: CRON_TIMEOUT_MS });
      return { tenants, square };
    });

    if (!result.acquired) {
      return apiOk({ skipped: true, reason: "lock-held" });
    }

    const elapsed = Date.now() - startTime;
    console.info("[encrypt-backfill] finished", { elapsed_ms: elapsed, ...result.value });
    return apiOk({ elapsed_ms: elapsed, ...result.value });
  } catch (e) {
    await sendCronFailureAlert("encrypt-secrets-backfill", e);
    return apiInternalError(e, "encrypt-secrets-backfill");
  }
}
