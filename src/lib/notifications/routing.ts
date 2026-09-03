/**
 * 通知チャネル解決 & 要対応カウントヘルパー（IMP-029）。
 *
 * v2.0 §13: Role/Severity ルーティング・要対応件数分離。
 *
 * 既存の通知モジュール（bookingNotify, SLA cron 等）はそのまま動作する。
 * この関数群は新しい通知を追加するときの共通ユーティリティと、
 * 将来の統合 dispatch の入力値生成を提供する。
 */

import {
  type NotificationChannel,
  type NotificationType,
  type NotificationSeverity,
  type NotificationCategory,
  type NotificationTypeConfig,
  getTypeConfig,
  isActionRequired,
} from "./types";

// ── チャネル解決 ──

export type ChannelOverrides = {
  /** チャネルを無効にする（例: テナントが Slack 未設定なら slack を除外）。 */
  disabledChannels?: readonly NotificationChannel[];
  /** チャネルを追加する（例: 管理者設定で push を有効にした場合）。 */
  additionalChannels?: readonly NotificationChannel[];
};

/**
 * 通知タイプの設定とオーバーライドからアクティブなチャネルリストを解決する。
 *
 * 1. タイプカタログの defaultChannels を基準にする
 * 2. disabledChannels を除外する
 * 3. additionalChannels を追加する
 * 4. 重複を除去して返す
 *
 * ponytail: ユーザー設定（per-user channel preferences）は将来追加。
 * 今は disable/add で十分。
 */
export function resolveChannels(type: string, overrides?: ChannelOverrides): NotificationChannel[] {
  const config = getTypeConfig(type);
  const disabled = new Set(overrides?.disabledChannels ?? []);

  const channels = new Set<NotificationChannel>();
  for (const ch of config.defaultChannels) {
    if (!disabled.has(ch)) channels.add(ch);
  }
  for (const ch of overrides?.additionalChannels ?? []) {
    if (!disabled.has(ch)) channels.add(ch);
  }
  return [...channels];
}

// ── 要対応件数 ──

export type NotificationForCount = {
  type: string;
  read?: boolean;
};

/**
 * 通知リストから「要対応」件数をカウントする。
 *
 * v2.0 §13: UI バッジは urgent + action_required のうち未読のみをカウント。
 * informational は件数に含めない。
 *
 * @param notifications - 通知一覧（type と read フラグ）
 * @returns 要対応（未読）件数
 */
export function countActionRequired(notifications: readonly NotificationForCount[]): number {
  let count = 0;
  for (const n of notifications) {
    if (n.read) continue;
    const config = getTypeConfig(n.type);
    if (isActionRequired(config.severity)) count++;
  }
  return count;
}

// ── 通知グルーピング ──

export type GroupedNotifications<T extends { type: string }> = {
  [K in NotificationCategory]?: T[];
};

/**
 * 通知をカテゴリでグルーピングする。UI のセクション表示用。
 */
export function groupByCategory<T extends { type: string }>(notifications: readonly T[]): GroupedNotifications<T> {
  const groups: Record<string, T[]> = {};
  for (const n of notifications) {
    const config = getTypeConfig(n.type);
    const cat = config.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(n);
  }
  return groups as GroupedNotifications<T>;
}

// ── 重要度フィルタ ──

/**
 * 指定した重要度以上の通知のみを返す。
 * urgent > action_required > informational の順。
 */
export function filterBySeverity<T extends { type: string }>(
  notifications: readonly T[],
  minSeverity: NotificationSeverity,
): T[] {
  const minRank = severityRank(minSeverity);
  return notifications.filter((n) => {
    const config = getTypeConfig(n.type);
    return severityRank(config.severity) >= minRank;
  });
}

function severityRank(severity: NotificationSeverity): number {
  switch (severity) {
    case "urgent":
      return 3;
    case "action_required":
      return 2;
    case "informational":
      return 1;
  }
}

// ── 再エクスポート ──
// ponytail: routing を import すれば types の主要型も使えるように。

export type {
  NotificationChannel,
  NotificationType,
  NotificationSeverity,
  NotificationCategory,
  NotificationTypeConfig,
};
