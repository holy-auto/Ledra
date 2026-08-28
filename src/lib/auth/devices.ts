/**
 * ユーザー端末管理型・ヘルパー（IMP-012）。
 *
 * v2.0 §15 の端末登録・遠隔失効を型で定義する。
 * edge/deviceRegistry.ts（IoT ハードウェアデバイス）とは別物 — こちらは
 * ユーザーのブラウザ・モバイル端末を管理する。
 *
 * DB テーブル `user_devices` は別途マイグレーションで作成。
 * ここでは型定義と純粋ロジックのみ。
 */

// ── 端末情報型 ──

export const DEVICE_PLATFORMS = ["web", "ios", "android"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const DEVICE_STATUSES = ["active", "revoked"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export type UserDevice = {
  id: string;
  userId: string;
  /** ユーザーが認識できるデバイス名（例: "iPhone 15", "Chrome on Mac"） */
  deviceName: string;
  platform: DevicePlatform;
  status: DeviceStatus;
  /** パスキー credential ID との紐付け（任意） */
  credentialId?: string;
  /** 端末フィンガープリント（ブラウザ UA + 解像度等のハッシュ） */
  fingerprint?: string;
  registeredAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  /** 失効理由（ユーザーの自発的削除 / 管理者による遠隔失効） */
  revokeReason?: "user" | "admin" | "suspicious";
};

// ── 端末信頼度 ──

export const DEVICE_TRUST_LEVELS = ["unknown", "recognized", "trusted"] as const;
export type DeviceTrustLevel = (typeof DEVICE_TRUST_LEVELS)[number];

/**
 * 端末の信頼度を判定する。
 * - trusted: 登録済み active + パスキー紐付けあり
 * - recognized: 登録済み active（パスキーなし）
 * - unknown: 未登録 or 失効済み
 */
export function deviceTrustLevel(device: UserDevice | null): DeviceTrustLevel {
  if (!device || device.status === "revoked") return "unknown";
  return device.credentialId ? "trusted" : "recognized";
}

/**
 * 端末が失効可能かを判定する。
 * ponytail: すでに失効済みなら何もしない。
 */
export function canRevoke(device: UserDevice): boolean {
  return device.status === "active";
}

/**
 * 端末を失効させる（純粋関数、DB 更新は呼び出し側）。
 */
export function revokeDevice(
  device: UserDevice,
  reason: NonNullable<UserDevice["revokeReason"]>,
  now: string,
): UserDevice | null {
  if (!canRevoke(device)) return null;
  return { ...device, status: "revoked", revokedAt: now, revokeReason: reason };
}
