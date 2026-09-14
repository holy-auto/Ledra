/**
 * 通知エンジン型定義（IMP-029）。
 *
 * v2.0 §13: 中央通知エンジン・Role/Severity/経過時間ルーティング・
 * 要対応件数分離の型基盤。
 *
 * 既存の用途別通知（bookingNotify, SLA cron, follow-up cron 等）は
 * そのまま動作する。この型基盤は新しい通知を追加するときの共通語彙と、
 * 将来の統合 dispatch の入力型を提供する。
 */

// ── 配信チャネル ──

export const NOTIFICATION_CHANNELS = ["in_app", "email", "slack", "line", "sms", "push"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// ── 重要度 ──

/**
 * 通知の重要度。UI は severity でフィルタ・ソートし、
 * 「要対応」バッジは action_required + urgent のみをカウントする。
 *
 * - urgent: 即時対応が必要（SLA 超過、決済失敗、セキュリティ）
 * - action_required: 対応が必要だがタイムリミットが緩い（承認依頼、レビュー待ち）
 * - informational: FYI（完了通知、ステータス変更）
 */
export const NOTIFICATION_SEVERITIES = ["urgent", "action_required", "informational"] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** 要対応カウント対象か。UI バッジはこの判定でフィルタする。 */
export function isActionRequired(severity: NotificationSeverity): boolean {
  return severity !== "informational";
}

// ── 通知カテゴリ ──

export const NOTIFICATION_CATEGORIES = [
  "booking", // 予約・入庫
  "job", // 作業・工程
  "certificate", // 証明書・発行
  "payment", // 支払い・請求
  "customer", // 顧客確認・懸念
  "sla", // SLA・エスカレーション
  "system", // システム・プラットフォーム
  "ai", // AI 自動化
  "message", // メッセージ・チャット
  "inventory", // 在庫・部品
  "maintenance", // フォローアップ・メンテナンス
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// ── 通知タイプ設定 ──

export type NotificationTypeConfig = {
  severity: NotificationSeverity;
  /** デフォルト配信チャネル。ユーザー設定で上書き可能（将来）。 */
  defaultChannels: readonly NotificationChannel[];
  category: NotificationCategory;
  /** 通知先のロール。undefined = コンテキストで決定。 */
  targetRole?: "owner" | "admin" | "staff" | "assigned" | "customer";
};

/**
 * 通知タイプカタログ。
 *
 * 既存の notification_type 文字列（DB 中の text カラム）と
 * 新規タイプの両方を含む。既存タイプは現行の挙動を型で記述したもので、
 * 動作は変えない。
 *
 * ponytail: 実在するタイプのみ収録。仮想タイプは追加しない。
 */
export const NOTIFICATION_TYPE_CATALOG = {
  // ── 予約 ──
  booking_created: {
    severity: "action_required",
    defaultChannels: ["in_app", "email", "slack"],
    category: "booking",
    targetRole: "admin",
  },

  // ── 作業 ──
  order_created: {
    severity: "action_required",
    defaultChannels: ["in_app"],
    category: "job",
  },
  order_accepted: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "job",
  },
  order_completed: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "job",
  },
  order_cancelled: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "job",
  },

  // ── 支払い ──
  payment_confirmed: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "payment",
  },

  // ── 証明書 ──
  certificate_gate_ready: {
    severity: "action_required",
    defaultChannels: ["in_app"],
    category: "certificate",
    targetRole: "admin",
  },
  certificate_issued: {
    severity: "informational",
    defaultChannels: ["in_app", "line"],
    category: "certificate",
    targetRole: "customer",
  },

  // ── 顧客 ──
  customer_concern_raised: {
    severity: "urgent",
    defaultChannels: ["in_app", "slack"],
    category: "customer",
    targetRole: "admin",
  },
  rating_request: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "customer",
    targetRole: "customer",
  },
  rating_received: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "customer",
  },

  // ── SLA ──
  sla_at_risk: {
    severity: "action_required",
    defaultChannels: ["in_app"],
    category: "sla",
    targetRole: "assigned",
  },
  sla_overdue: {
    severity: "urgent",
    defaultChannels: ["in_app", "email"],
    category: "sla",
    targetRole: "assigned",
  },

  // ── システム ──
  platform_notification: {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "system",
  },

  // ── AI ──
  ai_action: {
    severity: "action_required",
    defaultChannels: ["in_app"],
    category: "ai",
  },

  // ── メッセージ ──
  chat_message: {
    severity: "action_required",
    defaultChannels: ["in_app"],
    category: "message",
  },

  // ── 在庫 ──
  low_stock_alert: {
    severity: "action_required",
    defaultChannels: ["email"],
    category: "inventory",
    targetRole: "admin",
  },

  // ── メンテナンス ──
  follow_up_reminder: {
    severity: "informational",
    defaultChannels: ["email", "line"],
    category: "maintenance",
    targetRole: "customer",
  },
} as const satisfies Record<string, NotificationTypeConfig>;

export type NotificationType = keyof typeof NOTIFICATION_TYPE_CATALOG;

const _typeSet: ReadonlySet<string> = new Set(Object.keys(NOTIFICATION_TYPE_CATALOG));

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && _typeSet.has(v);
}

/** カタログからタイプの設定を取得。未知のタイプは informational/in_app。 */
export function getTypeConfig(type: string): NotificationTypeConfig {
  if (_typeSet.has(type)) {
    return NOTIFICATION_TYPE_CATALOG[type as NotificationType];
  }
  // ponytail: 未知タイプは安全側（informational, in_app のみ）
  return {
    severity: "informational",
    defaultChannels: ["in_app"],
    category: "system",
  };
}
