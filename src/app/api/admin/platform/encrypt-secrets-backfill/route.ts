/**
 * POST /api/admin/platform/encrypt-secrets-backfill
 *
 * 管理画面から手動でテナント機微情報の暗号化バックフィルを実行する。
 * Vercel cron を使わない運用方針なので、こちらを正規の実行経路として用意。
 *
 * 認証: platform admin (PLATFORM_TENANT_ID の owner / admin) のみ。
 * メソッド: POST のみ (副作用があるため)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiError } from "@/lib/api/response";
import { withCronLock } from "@/lib/cron/lock";
import { hasEncryptionKey } from "@/lib/crypto/secretBox";
import { backfillTenants, backfillSquareConnections } from "@/lib/crypto/backfillSecrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 55_000;
const LOCK_TTL_SECONDS = 600;

export async function POST() {
  const startTime = Date.now();

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    if (!hasEncryptionKey()) {
      return apiError({
        code: "validation_error",
        message: "SECRET_ENCRYPTION_KEY is not configured",
        status: 400,
      });
    }

    const admin = createServiceRoleAdmin(
      "platform admin: encrypt-secrets-backfill — encrypts plaintext tenant secrets across every tenant",
    );

    const result = await withCronLock(admin, "encrypt-secrets-backfill", LOCK_TTL_SECONDS, async () => {
      const tenants = await backfillTenants(admin, { startTime, timeoutMs: TIMEOUT_MS });
      const square = await backfillSquareConnections(admin, { startTime, timeoutMs: TIMEOUT_MS });
      return { tenants, square };
    });

    if (!result.acquired) {
      return apiOk({ skipped: true, reason: "lock-held" });
    }

    const elapsed = Date.now() - startTime;
    console.info("[encrypt-backfill] (admin) finished", {
      caller_user_id: caller.userId,
      elapsed_ms: elapsed,
      ...result.value,
    });
    return apiOk({ elapsed_ms: elapsed, ...result.value });
  } catch (e) {
    return apiInternalError(e, "admin encrypt-secrets-backfill");
  }
}
