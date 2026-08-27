/**
 * ドメインイベント型定義（IMP-014）。
 *
 * v2.0 §20: イベントエンベロープ — actor / tenant / store scope / risk level を
 * 統一的に持つ型付きイベント。
 *
 * 目的:
 * - 監査ログ・outbox・通知パイプラインに共通するイベント形式
 * - IMP-013 の RiskLevel / store scope と接続
 * - イベントバージョニング（将来のスキーマ進化）
 *
 * ここでは型定義と純粋なファクトリのみ。
 * DB 書き込み・パイプライン配送は既存の logAuditEvent / emitTenantEvent を使い続ける。
 * 統合は IMP-044。
 */
import type { DomainEventType } from "./catalogue";
import type { RiskLevel } from "@/lib/auth/permissionVerbs";

// ── アクター ──

/** イベントを起こした主体。 */
export type EventActor =
  | { kind: "user"; userId: string }
  | { kind: "system"; component: string }
  | { kind: "ai"; actionKey: string }
  | { kind: "cron"; jobName: string }
  | { kind: "webhook"; source: string };

// ── イベントエンベロープ ──

/**
 * v2.0 §20 ドメインイベント。
 *
 * T はイベント固有のペイロード型（certificate.issued なら certificateId + publicId 等）。
 * 既存コードは T = Record<string, unknown> で緩く使い、段階的にペイロード型を定義する。
 */
export type DomainEvent<T = Record<string, unknown>> = {
  /** イベントカタログ上の型。 */
  type: DomainEventType;

  /**
   * イベントスキーマバージョン。ペイロード形式が変わるときにインクリメント。
   * ponytail: 初期は全イベント version=1。バージョニングポリシーは IMP-044 で判断。
   */
  version: number;

  /** テナント ID。マルチテナント分離の基本軸。 */
  tenantId: string;

  /** 発生店舗（店舗スコープイベントの場合）。 */
  storeId?: string;

  /** イベントを起こした主体。 */
  actor: EventActor;

  /** 操作リスクレベル（IMP-013）。監査レベル・step-up 認証の入力。 */
  risk: RiskLevel;

  /** イベント固有のペイロード。 */
  payload: T;

  /** ISO 8601 タイムスタンプ。 */
  occurredAt: string;

  /**
   * 冪等キー。同一 key のイベントは重複として扱う。
   * ponytail: 生成は呼び出し側の責任。ここでは型のみ定義。
   * 既存 3 冪等系統（Redis API / cert Postgres / webhook dedup）との統合は IMP-044。
   */
  idempotencyKey?: string;

  /** 対象エンティティの参照（任意）。 */
  subject?: {
    kind: string;
    id: string;
  };
};

// ── ファクトリ ──

/** DomainEvent 生成に必要な最小入力。occurredAt / version はデフォルト供給。 */
export type CreateDomainEventInput<T = Record<string, unknown>> = Omit<DomainEvent<T>, "version" | "occurredAt"> & {
  version?: number;
  occurredAt?: string;
};

/**
 * DomainEvent を生成する純粋ファクトリ。
 *
 * ponytail: Date.now() 依存は呼び出し側から occurredAt で注入可能（テスト容易性）。
 * デフォルトは現在時刻。
 */
export function createDomainEvent<T = Record<string, unknown>>(input: CreateDomainEventInput<T>): DomainEvent<T> {
  return {
    ...input,
    version: input.version ?? 1,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

// ── イベントリスクレベル推定 ──

/**
 * DomainEventType からデフォルトのリスクレベルを推定する。
 *
 * IMP-013 の operationRisk() は Permission ベースだが、イベントは Permission と
 * 1:1 対応しないものもある（AI 自動実行、cron、public 閲覧等）。
 * ここではイベント型からの直接マッピングを提供する。
 *
 * 呼び出し側が Permission を持っている場合は operationRisk() を優先してよい。
 * ponytail: 未登録は "low"（閲覧系のデフォルト）。
 */
const EVENT_RISK: Partial<Record<DomainEventType, RiskLevel>> = {
  // Critical — 不可逆・法的影響
  "certificate.voided": "critical",

  // High — 金銭・証明書・メンバー管理
  "certificate.issued": "high",
  "certificate.edited": "high",
  "invoice.created": "high",
  "invoice.paid": "high",
  "payment.created": "high",
  "payment.completed": "high",
  "member.added": "high",
  "member.removed": "high",
  "member.role_changed": "high",

  // Medium — 通常のデータ変更
  "vehicle.registered": "medium",
  "vehicle.updated": "medium",
  "customer.created": "medium",
  "customer.updated": "medium",
  "reservation.created": "medium",
  "reservation.completed": "medium",
  "reservation.cancelled": "medium",
  "store.created": "medium",
  "store.updated": "medium",
  "ai.settings_changed": "medium",
  "ai.auto_action_executed": "medium",
  "work_history.created": "medium",
  "insurer_case.created": "medium",
  "insurer_case.status_changed": "medium",
  "progress.updated": "medium",
  "thickness.measured": "medium",

  // 同期（IMP-016）。**競合は medium 以上にする** —— 未登録だと `?? "low"` に
  // 落ちて、証明書の競合が進捗メモより下に格付けされる。
  "sync.conflict_detected": "medium",
  "sync.conflict_resolved": "medium",
  "sync.failed": "medium",
  // 開始・完了そのものは通常の進行なので low のまま（未登録＝low）。
};

/** イベント型のデフォルトリスクレベル。未登録（閲覧系）は "low"。 */
export function eventRisk(type: DomainEventType): RiskLevel {
  return EVENT_RISK[type] ?? "low";
}
