/**
 * GET /api/cron/encrypt-secrets-backfill
 *
 * STEP 2 / 3: 既存の平文列に保存されている機微情報を暗号化列にバックフィル
 * する一回限りの cron。idempotent なので何度走らせても安全。
 *
 * 対象:
 *   - tenants.line_channel_secret           → line_channel_secret_ciphertext
 *   - tenants.line_channel_access_token     → line_channel_access_token_ciphertext
 *   - square_connections.square_access_token  → square_access_token_ciphertext
 *   - square_connections.square_refresh_token → square_refresh_token_ciphertext
 *
 * 実行方針:
 *   - ciphertext 列が NULL かつ平文列が NOT NULL の行のみ更新
 *   - 1 リクエストで最大 BATCH_LIMIT 行 (大量レコードでもタイムアウトしない)
 *   - vercel cron に 1 日 1 回登録。完了後は no-op。
 *   - PR3 (平文列 DROP) 完了時に cron 登録ごと削除すること。
 *
 * 認証: verifyCronRequest (Vercel cron 署名 or `Bearer $CRON_SECRET`)
 *
 * 失敗モード:
 *   - SECRET_ENCRYPTION_KEY 未設定 → 早期に skipped で終了。本番では env 設定漏れを検知。
 *   - 個別行の暗号化失敗 → エラーをログに残し、その行はスキップして次へ。
 */
import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { encryptSecret, hasEncryptionKey } from "@/lib/crypto/secretBox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 200;
const CRON_TIMEOUT_MS = 55_000;
const LOCK_TTL_SECONDS = 600;

type SectionResult = {
  table: string;
  scanned: number;
  updated: number;
  skipped_already_encrypted: number;
  errors: number;
};

async function backfillTenants(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  startTime: number,
): Promise<SectionResult> {
  const result: SectionResult = {
    table: "tenants",
    scanned: 0,
    updated: 0,
    skipped_already_encrypted: 0,
    errors: 0,
  };

  const { data: rows, error } = await admin
    .from("tenants")
    .select(
      "id, line_channel_secret, line_channel_secret_ciphertext, line_channel_access_token, line_channel_access_token_ciphertext",
    )
    .or("line_channel_secret.not.is.null,line_channel_access_token.not.is.null")
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[encrypt-backfill] tenants select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
    if (Date.now() - startTime > CRON_TIMEOUT_MS) {
      console.warn("[encrypt-backfill] timeout guard reached during tenants loop");
      break;
    }
    result.scanned++;

    const updates: Record<string, string> = {};
    try {
      if (row.line_channel_secret && !row.line_channel_secret_ciphertext) {
        updates.line_channel_secret_ciphertext = await encryptSecret(row.line_channel_secret as string);
      }
      if (row.line_channel_access_token && !row.line_channel_access_token_ciphertext) {
        updates.line_channel_access_token_ciphertext = await encryptSecret(row.line_channel_access_token as string);
      }
    } catch (e) {
      console.error("[encrypt-backfill] tenants encrypt error", { id: row.id, error: e });
      result.errors++;
      continue;
    }

    if (Object.keys(updates).length === 0) {
      result.skipped_already_encrypted++;
      continue;
    }

    const { error: upErr } = await admin
      .from("tenants")
      .update(updates)
      .eq("id", row.id as string);
    if (upErr) {
      console.error("[encrypt-backfill] tenants update error", { id: row.id, error: upErr.message });
      result.errors++;
      continue;
    }
    result.updated++;
  }

  return result;
}

async function backfillSquareConnections(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  startTime: number,
): Promise<SectionResult> {
  const result: SectionResult = {
    table: "square_connections",
    scanned: 0,
    updated: 0,
    skipped_already_encrypted: 0,
    errors: 0,
  };

  const { data: rows, error } = await admin
    .from("square_connections")
    .select(
      "id, square_access_token, square_access_token_ciphertext, square_refresh_token, square_refresh_token_ciphertext",
    )
    .or("square_access_token.not.is.null,square_refresh_token.not.is.null")
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[encrypt-backfill] square_connections select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
    if (Date.now() - startTime > CRON_TIMEOUT_MS) {
      console.warn("[encrypt-backfill] timeout guard reached during square_connections loop");
      break;
    }
    result.scanned++;

    const updates: Record<string, string> = {};
    try {
      if (row.square_access_token && !row.square_access_token_ciphertext) {
        updates.square_access_token_ciphertext = await encryptSecret(row.square_access_token as string);
      }
      if (row.square_refresh_token && !row.square_refresh_token_ciphertext) {
        updates.square_refresh_token_ciphertext = await encryptSecret(row.square_refresh_token as string);
      }
    } catch (e) {
      console.error("[encrypt-backfill] square_connections encrypt error", { id: row.id, error: e });
      result.errors++;
      continue;
    }

    if (Object.keys(updates).length === 0) {
      result.skipped_already_encrypted++;
      continue;
    }

    const { error: upErr } = await admin
      .from("square_connections")
      .update(updates)
      .eq("id", row.id as string);
    if (upErr) {
      console.error("[encrypt-backfill] square_connections update error", { id: row.id, error: upErr.message });
      result.errors++;
      continue;
    }
    result.updated++;
  }

  return result;
}

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
      const tenants = await backfillTenants(admin, startTime);
      const square = await backfillSquareConnections(admin, startTime);
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
