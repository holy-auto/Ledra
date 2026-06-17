/**
 * エッジデバイス登録・管理サービス
 *
 * セキュリティモデル:
 *   - デバイスシークレット（HMAC キー）は登録時に一度だけ返す
 *   - DB にはシークレットの SHA-256 ハッシュのみを保存
 *   - イベント送信時は HMAC-SHA256 署名で認証
 */

import { randomUUID } from "crypto";
import crypto from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import type { EdgeDevice, EdgeDeviceKind, RegisterDeviceInput } from "./types";

const DEVICE_SECRET_PREFIX = "ledra-edge-v1";

/** デバイスシークレットを生成（一度だけ返す） */
export function generateDeviceSecret(): string {
  return `${DEVICE_SECRET_PREFIX}-${randomUUID().replace(/-/g, "")}`;
}

/** シークレットのハッシュを計算（DB 保存用） */
export function hashDeviceSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * デバイス HMAC 署名を検証する。
 * 署名対象: HMAC-SHA256(secret, eventId + ":" + deviceTimestamp + ":" + payloadJson)
 */
export function verifyDeviceSignature(
  secret: string,
  eventId: string,
  deviceTimestamp: string,
  payloadJson: string,
  signature: string,
): boolean {
  const message = `${eventId}:${deviceTimestamp}:${payloadJson}`;
  const expected = crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
  // タイミング攻撃対策: timingSafeEqual
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** デバイスシークレットをハッシュで検索して認証する */
export async function authenticateDevice(
  tenantId: string,
  deviceId: string,
  secretHash: string,
): Promise<EdgeDevice | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin
    .from("edge_devices")
    .select("*")
    .eq("id", deviceId)
    .eq("tenant_id", tenantId)
    .eq("device_key_hash", secretHash)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return rowToDevice(data);
}

/** デバイスを登録して秘密キーを返す（一度のみ） */
export async function registerDevice(
  tenantId: string,
  _userId: string,
  input: RegisterDeviceInput,
): Promise<{ device: EdgeDevice; secret: string }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const deviceId = randomUUID();
  const secret = generateDeviceSecret();
  const secretHash = hashDeviceSecret(secret);
  const now = new Date().toISOString();

  const row = {
    id: deviceId,
    tenant_id: tenantId,
    kind: input.kind,
    display_name: input.displayName,
    status: "active" as const,
    device_key_hash: secretHash,
    firmware_version: input.firmwareVersion ?? null,
    last_seen_at: null,
    registered_at: now,
    metadata: input.metadata ?? {},
  };

  const { error } = await admin.from("edge_devices").insert(row);
  if (error) throw new Error(`edge_devices insert failed: ${error.message}`);

  return { device: rowToDevice(row), secret };
}

/** デバイスの最終確認時刻を更新 */
export async function touchDeviceLastSeen(tenantId: string, deviceId: string): Promise<void> {
  const { admin } = createTenantScopedAdmin(tenantId);
  await admin
    .from("edge_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", deviceId)
    .eq("tenant_id", tenantId);
}

/** テナントのデバイス一覧を取得 */
export async function listDevices(tenantId: string): Promise<EdgeDevice[]> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin
    .from("edge_devices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("registered_at", { ascending: false });

  if (error) throw new Error(`edge_devices list failed: ${error.message}`);
  return (data ?? []).map(rowToDevice);
}

/** デバイスを無効化 */
export async function revokeDevice(tenantId: string, deviceId: string): Promise<void> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { error } = await admin
    .from("edge_devices")
    .update({ status: "revoked" })
    .eq("id", deviceId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(`edge_devices revoke failed: ${error.message}`);
}

function rowToDevice(row: Record<string, unknown>): EdgeDevice {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    kind: row.kind as EdgeDeviceKind,
    displayName: row.display_name as string,
    status: row.status as EdgeDevice["status"],
    deviceKeyHash: row.device_key_hash as string,
    firmwareVersion: (row.firmware_version as string | null) ?? null,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    registeredAt: row.registered_at as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
