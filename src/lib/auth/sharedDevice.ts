/**
 * 共用端末モード型定義（IMP-034）。
 *
 * v2.0 §4: 整備工場のタブレットを複数スタッフが共用するケースに対応する
 * ユーザー切替の型基盤。
 *
 * ponytail: 実際の認証フロー実装（PIN 入力 UI、セッション管理）は後続タスク。
 * ここでは型定義と純関数のみ。
 */

import type { DeviceTrustLevel } from "./devices";

// ── セッションモード ──

/**
 * 端末のセッションモード。
 * - personal: 個人端末（通常の認証フロー）
 * - shared: 共用端末（高速ユーザー切替あり）
 */
export const SESSION_MODES = ["personal", "shared"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

// ── 切替認証方式 ──

/**
 * ユーザー切替時の認証方式。
 *
 * ponytail: 共用端末では full_auth（フルログイン）を要求すると運用不可。
 * PIN が最も軽量で整備工場の現場向き。biometric はタブレット次第。
 */
export const SWITCH_AUTH_METHODS = ["pin", "biometric", "full_auth"] as const;
export type SwitchAuthMethod = (typeof SWITCH_AUTH_METHODS)[number];

// ── 共用端末セッション ──

export type SharedDeviceSession = {
  /** 共用端末として登録した device ID */
  deviceId: string;
  /** 現在アクティブなユーザー ID */
  activeUserId: string;
  /** 現在のユーザーの表示名 */
  activeUserName: string;
  /** 最後のユーザー切替時刻（ISO 8601） */
  lastSwitchAt: string;
  /** 自動ロックまでの無操作秒数 */
  autoLockSeconds: number;
};

// ── 判定関数 ──

/**
 * 共用端末モードでユーザー切替が可能かを判定する。
 * ponytail: personal モードでは切替不可。
 */
export function canSwitchUser(mode: SessionMode): boolean {
  return mode === "shared";
}

/**
 * ユーザー切替時に要求する認証方式を決定する。
 *
 * - trusted 端末（パスキー登録済み）→ biometric
 * - recognized 端末（登録済みだがパスキーなし）→ PIN
 * - unknown 端末 → full_auth（共用端末として未登録）
 */
export function switchAuthRequirement(trustLevel: DeviceTrustLevel): SwitchAuthMethod {
  switch (trustLevel) {
    case "trusted":
      return "biometric";
    case "recognized":
      return "pin";
    case "unknown":
      return "full_auth";
  }
}

/**
 * 自動ロックのデフォルト秒数。
 *
 * ponytail: 整備工場の現場では手が汚れてすぐに操作できないことがあるため、
 * 短すぎるとストレス。5 分がバランス。設定画面で変更可能にする想定。
 */
export const DEFAULT_AUTO_LOCK_SECONDS = 300;
