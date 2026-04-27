/**
 * encrypt-secrets-backfill.ts
 *
 * STEP 2 / 3: 既存の平文列に保存されているテナント機微情報を暗号化列に
 * バックフィルするワンショットスクリプト。idempotent なので何度実行しても安全。
 *
 * 対象:
 *   - tenants.line_channel_secret           → line_channel_secret_ciphertext
 *   - tenants.line_channel_access_token     → line_channel_access_token_ciphertext
 *   - square_connections.square_access_token  → square_access_token_ciphertext
 *   - square_connections.square_refresh_token → square_refresh_token_ciphertext
 *
 * 前提 env (`.env.local` 等で設定):
 *   - SUPABASE_URL                  (もしくは NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SECRET_ENCRYPTION_KEY         (base64 エンコードの 32 バイト)
 *
 * 実行:
 *   npx tsx scripts/encrypt-secrets-backfill.ts
 *   npx tsx scripts/encrypt-secrets-backfill.ts --dry-run
 *
 * 完了判定:
 *   再実行して両テーブルとも updated=0、scanned===skipped_already_encrypted
 *   ならバックフィル完了。
 *
 * Vercel cron / API route ではなくローカルから直接 Supabase を叩くため、
 * Vercel cron 認証 (`CRON_SECRET`) は不要。SUPABASE_SERVICE_ROLE_KEY を
 * 持っている運用者のみが実行できる前提。
 */

import { createClient } from "@supabase/supabase-js";
import { encryptSecret, hasEncryptionKey } from "../src/lib/crypto/secretBox";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  process.exit(1);
}

if (!hasEncryptionKey()) {
  console.error("❌ SECRET_ENCRYPTION_KEY が未設定または不正です (base64 32 bytes が必要)。");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type SectionResult = {
  table: string;
  scanned: number;
  updated: number;
  skipped_already_encrypted: number;
  errors: number;
};

async function backfillTenants(): Promise<SectionResult> {
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
    .or("line_channel_secret.not.is.null,line_channel_access_token.not.is.null");

  if (error) {
    console.error("[backfill] tenants select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
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
      console.error("[backfill] tenants encrypt error", { id: row.id, error: e });
      result.errors++;
      continue;
    }

    if (Object.keys(updates).length === 0) {
      result.skipped_already_encrypted++;
      continue;
    }

    if (dryRun) {
      console.info("[backfill] DRY-RUN tenants would update", { id: row.id, columns: Object.keys(updates) });
      result.updated++;
      continue;
    }

    const { error: upErr } = await admin.from("tenants").update(updates).eq("id", row.id as string);
    if (upErr) {
      console.error("[backfill] tenants update error", { id: row.id, error: upErr.message });
      result.errors++;
      continue;
    }
    result.updated++;
  }

  return result;
}

async function backfillSquareConnections(): Promise<SectionResult> {
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
    .or("square_access_token.not.is.null,square_refresh_token.not.is.null");

  if (error) {
    console.error("[backfill] square_connections select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
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
      console.error("[backfill] square_connections encrypt error", { id: row.id, error: e });
      result.errors++;
      continue;
    }

    if (Object.keys(updates).length === 0) {
      result.skipped_already_encrypted++;
      continue;
    }

    if (dryRun) {
      console.info("[backfill] DRY-RUN square_connections would update", { id: row.id, columns: Object.keys(updates) });
      result.updated++;
      continue;
    }

    const { error: upErr } = await admin.from("square_connections").update(updates).eq("id", row.id as string);
    if (upErr) {
      console.error("[backfill] square_connections update error", { id: row.id, error: upErr.message });
      result.errors++;
      continue;
    }
    result.updated++;
  }

  return result;
}

async function main() {
  console.info(dryRun ? "🔍 DRY-RUN mode (DB 書き込みなし)" : "🔐 backfill 実行");
  const tenants = await backfillTenants();
  const square = await backfillSquareConnections();
  console.info("\n=== 結果 ===");
  console.table([tenants, square]);
  const totalErrors = tenants.errors + square.errors;
  if (totalErrors > 0) {
    console.error(`\n❌ ${totalErrors} 件のエラー。ログを確認してください。`);
    process.exit(1);
  }
  if (tenants.updated === 0 && square.updated === 0) {
    console.info("\n✅ 全行 backfill 済み。PR3 のマイグレーションを実行できます。");
  } else {
    console.info("\nℹ️  backfill 実行済み。再度叩いて updated=0 になることを確認してください。");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
