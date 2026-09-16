/**
 * Square Connect API の呼び出し口（テナントのアクセストークンを解決して叩く）。
 *
 * トークンは `square_connections` に暗号化して入っており、期限切れなら
 * リフレッシュして保存し直す。**同じ処理が cron のインポート側にもある**が、
 * あちらは稼働中なので今回は触らない（寄せるのは次に触るときでよい）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildSecretWrite, readSecret } from "@/lib/crypto/tenantSecrets";
import { logger } from "@/lib/logger";

const API_BASE = "https://connect.squareup.com";
/** Square の API バージョン。QR コード決済（`payment_type: QR_CODE`）を含む。 */
const SQUARE_VERSION = "2025-01-23";

export interface SquareContext {
  accessToken: string;
  locationId: string | null;
  terminalDeviceId: string | null;
}

export class SquareNotConnectedError extends Error {
  constructor(readonly reason: "not_connected" | "token_unavailable" | "token_refresh_failed" | "lookup_failed") {
    super(`square_${reason}`);
    this.name = "SquareNotConnectedError";
  }
}

async function refreshToken(
  admin: SupabaseClient,
  connectionId: string,
  refreshTokenValue: string,
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.warn("square: token refresh failed", { status: res.status });
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_at: string };
  const access = await buildSecretWrite(data.access_token);
  const refresh = await buildSecretWrite(data.refresh_token);
  await admin
    .from("square_connections")
    .update({
      square_access_token_ciphertext: access.ciphertext,
      square_refresh_token_ciphertext: refresh.ciphertext,
      square_token_expires_at: data.expires_at,
    })
    .eq("id", connectionId);
  return data.access_token;
}

/**
 * テナントの Square 接続を、すぐ使える形（有効なトークン付き）で返す。
 *
 * 繋がっていない・トークンが取り出せない場合は例外。呼び出し側は
 * 「Square 未接続」として扱う（会計そのものは止めない）。
 */
export async function getSquareContext(admin: SupabaseClient, tenantId: string): Promise<SquareContext> {
  const { data: conn, error } = await admin
    .from("square_connections")
    .select(
      "id, status, square_access_token_ciphertext, square_refresh_token_ciphertext, square_token_expires_at, square_location_ids, square_terminal_device_id",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // **照合できなかったことを「繋がっていない」と読まない。** 読むと、Square を
  // 使っている店の会計が「記録だけ」に落ちて、誰も課金されないまま領収書が出る
  if (error) throw new SquareNotConnectedError("lookup_failed");
  if (!conn || conn.status !== "active") throw new SquareNotConnectedError("not_connected");

  let accessToken = await readSecret(
    conn.square_access_token_ciphertext as string | null,
    "square_connections.square_access_token",
  );
  if (!accessToken) throw new SquareNotConnectedError("token_unavailable");

  const expiresAt = conn.square_token_expires_at ? new Date(conn.square_token_expires_at as string) : null;
  if (expiresAt && expiresAt <= new Date()) {
    const refresh = await readSecret(
      conn.square_refresh_token_ciphertext as string | null,
      "square_connections.square_refresh_token",
    );
    const renewed = refresh ? await refreshToken(admin, conn.id as string, refresh) : null;
    if (!renewed) throw new SquareNotConnectedError("token_refresh_failed");
    accessToken = renewed;
  }

  const locationIds = (conn.square_location_ids as string[] | null) ?? [];
  return {
    accessToken,
    locationId: locationIds[0] ?? null,
    terminalDeviceId: (conn.square_terminal_device_id as string | null) ?? null,
  };
}

export class SquareApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`square_api_${status}: ${detail}`);
    this.name = "SquareApiError";
  }
}

/** Square Connect API を叩く。失敗は本文付きで投げる（無音で握らない）。 */
export async function squareFetch<T>(
  accessToken: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // Square はエラーを { errors: [{ detail, code }] } で返す
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { errors?: Array<{ detail?: string; code?: string }> };
      detail = parsed.errors?.map((e) => e.detail ?? e.code).join(", ") || detail;
    } catch {
      // JSON でないエラー本文はそのまま使う
    }
    throw new SquareApiError(res.status, detail);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
