/**
 * 通知エンジン公開 API（IMP-029）。
 *
 * v2.0 §13: 中央通知エンジンの型基盤・Deep Link・エスカレーション・ルーティング。
 */

// Types & catalog
export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_CATALOG,
  isActionRequired,
  isNotificationType,
  getTypeConfig,
} from "./types";
export type {
  NotificationChannel,
  NotificationSeverity,
  NotificationCategory,
  NotificationType,
  NotificationTypeConfig,
} from "./types";

// Deep links
export { DEEP_LINK_ENTITIES, buildDeepLink, buildCertificatePublicLink } from "./deepLink";
export type { DeepLinkEntity, DeepLinkRole, DeepLinkParams, DeepLinkResult } from "./deepLink";

// Escalation
export { DEFAULT_SLA_THRESHOLDS, AT_RISK_RATIO, evaluateEscalation, shouldEscalate } from "./escalation";
export type { EscalationStage, SlaThresholds, EscalationResult } from "./escalation";

// Routing
export { resolveChannels, countActionRequired, groupByCategory, filterBySeverity } from "./routing";
export type { ChannelOverrides, NotificationForCount, GroupedNotifications } from "./routing";
