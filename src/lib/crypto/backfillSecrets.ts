/**
 * Tenant 機微情報 (LINE / Square OAuth) を暗号化列にバックフィルする共通ロジック。
 *
 * cron route / admin route / scripts などから呼べるよう、副作用は引数で受け取った
 * Supabase admin client にだけ閉じ込める。
 *
 * 並走呼び出しは想定していない (route 側で `withCronLock` 等で直列化する想定)。
 */

import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { encryptSecret } from "./secretBox";

type AdminLike = ReturnType<typeof createServiceRoleAdmin>;

export type BackfillSectionResult = {
  table: string;
  scanned: number;
  updated: number;
  skipped_already_encrypted: number;
  errors: number;
};

export type BackfillOptions = {
  /** Date.now() で取った開始時刻。タイムアウト計算に使う。省略時は無制限。 */
  startTime?: number;
  /** ループ中タイムアウト判定する閾値 (ms)。startTime が無いと無視。 */
  timeoutMs?: number;
  /** 一度に処理する最大行数。 */
  batchLimit?: number;
};

const DEFAULT_BATCH_LIMIT = 200;

function isTimedOut(opts?: BackfillOptions): boolean {
  if (!opts?.startTime || !opts?.timeoutMs) return false;
  return Date.now() - opts.startTime > opts.timeoutMs;
}

export async function backfillTenants(admin: AdminLike, opts?: BackfillOptions): Promise<BackfillSectionResult> {
  const result: BackfillSectionResult = {
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
    .limit(opts?.batchLimit ?? DEFAULT_BATCH_LIMIT);

  if (error) {
    console.error("[encrypt-backfill] tenants select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
    if (isTimedOut(opts)) {
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

export async function backfillSquareConnections(
  admin: AdminLike,
  opts?: BackfillOptions,
): Promise<BackfillSectionResult> {
  const result: BackfillSectionResult = {
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
    .limit(opts?.batchLimit ?? DEFAULT_BATCH_LIMIT);

  if (error) {
    console.error("[encrypt-backfill] square_connections select error:", error.message);
    result.errors++;
    return result;
  }

  for (const row of rows ?? []) {
    if (isTimedOut(opts)) {
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
