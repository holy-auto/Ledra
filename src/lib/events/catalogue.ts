/**
 * 統一ドメインイベントカタログ（IMP-014）。
 *
 * v2.0 §20 / Appendix B: Core Event Catalogue。
 * 既存の AuditEventType（27種）+ 未型化 2 種 + webhook topics（8種）を
 * 統一命名規約 `resource.action` で網羅する。
 *
 * 目的:
 * - 監査・outbox・通知の 3 系統に共通する単一定義源
 * - 既存 AuditEventType → DomainEventType のマッピング（段階的移行）
 * - v2.0 で追加されるイベントの予約枠
 *
 * 既存の AuditEventType / WebhookTopic / SecurityEventType は変更しない。
 * パイプライン統合（イベント→優先度→通知）は IMP-044。
 */

// ── イベントカタログ ──

/**
 * 全ドメインイベントを `resource.action` 形式で列挙。
 *
 * グループ:
 * - certificate.*: 証明書ライフサイクル（発行・編集・無効化・閲覧・PDF）
 * - vehicle.*: 車両登録・更新
 * - member.*: テナントメンバー管理
 * - reservation.*: 案件（予約）管理
 * - invoice.*: 請求書
 * - payment.*: 入金
 * - customer.*: 顧客
 * - store.*: 店舗
 * - ai.*: AI 提案・自動アクション
 * - work_history.*: 作業履歴
 * - insurer_case.*: 保険会社ケース
 * - progress.*: 作業進捗
 * - thickness.*: 膜厚測定
 * - note.*: メモ
 */
export const DOMAIN_EVENT_TYPES = [
  // 証明書
  "certificate.issued",
  "certificate.edited",
  "certificate.voided",
  "certificate.viewed",
  "certificate.pdf_generated",
  "certificate.pdf_batch",
  "certificate.public_viewed",
  "certificate.public_pdf",

  // 車両
  "vehicle.registered",
  "vehicle.updated",

  // メンバー
  "member.added",
  "member.removed",
  "member.role_changed",

  // 案件
  "reservation.created",
  "reservation.completed",
  "reservation.cancelled",

  // 請求書
  "invoice.created",
  "invoice.paid",

  // 入金
  "payment.created",
  "payment.completed",

  // 顧客
  "customer.created",
  "customer.updated",

  // 店舗
  "store.created",
  "store.updated",

  // AI
  "ai.settings_changed",
  "ai.suggestion_generated",
  "ai.suggestion_applied",
  "ai.suggestion_rejected",
  "ai.auto_action_executed",

  // 作業履歴
  "work_history.created",

  // 保険会社ケース
  "insurer_case.created",
  "insurer_case.status_changed",

  // 作業進捗（既存は untyped "progress_update"）
  "progress.updated",

  // 膜厚測定（既存は untyped "thickness_measurement"）
  "thickness.measured",

  // メモ
  "note.created",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** resource 部分を抽出する。 */
export type EventResource = DomainEventType extends `${infer R}.${string}` ? R : never;

// ── リソースグループ ──

const _typeSet: ReadonlySet<string> = new Set(DOMAIN_EVENT_TYPES);

/** 有効な DomainEventType か。 */
export function isDomainEventType(v: unknown): v is DomainEventType {
  return typeof v === "string" && _typeSet.has(v);
}

/** 指定リソースのイベント一覧を返す。 */
export function eventTypesForResource(resource: string): DomainEventType[] {
  const prefix = `${resource}.`;
  return DOMAIN_EVENT_TYPES.filter((t) => t.startsWith(prefix));
}

// ── 既存 AuditEventType → DomainEventType マッピング ──

/**
 * 既存の AuditEventType（snake_case）から DomainEventType（resource.action）への変換表。
 * 段階的移行に使用。新コードは DomainEventType を直接使う。
 *
 * ponytail: 完全な 1:1 対応。既存 AuditEventType 27 + AiAuditAction 1（重複除外）
 * + untyped 2 = 30 値をカバー。
 */
export const LEGACY_EVENT_MAP: Record<string, DomainEventType> = {
  // CertificateAuditType (8)
  certificate_issued: "certificate.issued",
  certificate_edited: "certificate.edited",
  certificate_voided: "certificate.voided",
  certificate_viewed: "certificate.viewed",
  certificate_pdf_generated: "certificate.pdf_generated",
  certificate_pdf_batch: "certificate.pdf_batch",
  certificate_public_viewed: "certificate.public_viewed",
  certificate_public_pdf: "certificate.public_pdf",

  // AuditEventType remainder (19)
  vehicle_registered: "vehicle.registered",
  vehicle_updated: "vehicle.updated",
  member_added: "member.added",
  member_removed: "member.removed",
  member_role_changed: "member.role_changed",
  reservation_created: "reservation.created",
  reservation_completed: "reservation.completed",
  reservation_cancelled: "reservation.cancelled",
  invoice_created: "invoice.created",
  invoice_paid: "invoice.paid",
  ai_settings_changed: "ai.settings_changed",
  ai_suggestion_generated: "ai.suggestion_generated",
  ai_suggestion_applied: "ai.suggestion_applied",
  ai_suggestion_rejected: "ai.suggestion_rejected",
  note: "note.created",

  // AiAuditAction extra (1, not in AuditEventType)
  ai_auto_action_executed: "ai.auto_action_executed",

  // Untyped (2, written directly to vehicle_histories)
  progress_update: "progress.updated",
  thickness_measurement: "thickness.measured",
};

/**
 * 既存の AuditEventType 文字列を DomainEventType に変換する。
 * 未知の値は null（呼び出し側で判断）。
 */
export function fromLegacyEventType(legacy: string): DomainEventType | null {
  return LEGACY_EVENT_MAP[legacy] ?? null;
}
