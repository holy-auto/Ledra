/**
 * IMP-044: イベント → 優先度パイプライン型定義。
 *
 * catalogue.ts のコメント:
 * > パイプライン統合（イベント→優先度→通知）は IMP-044
 *
 * domainEvent.ts のコメント:
 * > DB 書き込み・パイプライン配送は既存の logAuditEvent / emitTenantEvent を使い続ける。
 * > 統合は IMP-044。
 *
 * 本モジュールは「どのドメインイベントが優先度再計算をトリガーすべきか」の
 * マッピングと、パイプラインの型定義を提供する。
 * 実際のパイプライン配送（pub/sub / queue）の IO 実装は消費タスク。
 *
 * ponytail: 型と純関数のみ。IO なし。
 */

import type { DomainEventType } from "@/lib/events/catalogue";
import type { DomainEvent } from "@/lib/events/domainEvent";
import type { SignalSource } from "./scorer";

// ── 型 ──

/** 優先度への影響の種別。 */
export type PriorityEffect =
  /** シグナルの追加（新しいアクションが生まれる）。 */
  | "add_signal"
  /** 既存シグナルの更新（スコアが変わる）。 */
  | "update_signal"
  /** シグナルの除去（アクションが完了・不要に）。 */
  | "remove_signal";

/** イベントが優先度に与える影響の定義。 */
export interface PriorityTrigger {
  /** 対象イベント型。 */
  eventType: DomainEventType;
  /** 影響を受けるシグナルソース。 */
  affectedSources: readonly SignalSource[];
  /** 影響の種別。 */
  effect: PriorityEffect;
  /** 人間可読な説明（デバッグ / 管理画面用）。 */
  description: string;
}

/**
 * 優先度再計算リクエスト。
 *
 * イベントハンドラが本型を生成し、スコアリングサービスに渡す。
 * ponytail: 実際のキューイングは既存の QStash / after() に委ねる。
 */
export interface PriorityRecalcRequest {
  /** トリガーとなったイベント型。 */
  eventType: DomainEventType;
  /** テナント ID。 */
  tenantId: string;
  /** 影響を受けるエンティティ（予約 / 顧客 / ブース等）。 */
  entityId?: string;
  /** 再計算対象のシグナルソース。 */
  targetSources: readonly SignalSource[];
  /** 発生日時（イベントの occurredAt）。 */
  triggeredAt: string;
}

// ── マッピング ──

/**
 * 優先度に影響するドメインイベントのマッピング。
 *
 * 全 DomainEventType を網羅する必要はない。
 * 優先度に無関係なイベント（certificate.viewed, certificate.pdf_generated 等）は含めない。
 */
export const PRIORITY_TRIGGERS: readonly PriorityTrigger[] = [
  // ── 案件ライフサイクル ──
  {
    eventType: "reservation.created",
    affectedSources: ["dashboard", "job", "customer"],
    effect: "add_signal",
    description: "新規案件 → ダッシュボードの来店予約タイル / 顧客シグナルに反映",
  },
  {
    eventType: "reservation.completed",
    affectedSources: ["dashboard", "job", "customer", "booth"],
    effect: "update_signal",
    description: "案件完了 → 作業中タイル除去、証明書発行・請求書作成シグナル追加、ブース空き",
  },
  {
    eventType: "reservation.cancelled",
    affectedSources: ["dashboard", "job", "booth"],
    effect: "remove_signal",
    description: "案件キャンセル → 関連シグナル除去、ブース空き",
  },

  // ── 請求 / 入金 ──
  {
    eventType: "invoice.created",
    affectedSources: ["dashboard", "customer"],
    effect: "add_signal",
    description: "請求書作成 → 未払請求タイル / 顧客シグナルに反映",
  },
  {
    eventType: "invoice.paid",
    affectedSources: ["dashboard", "job", "customer"],
    effect: "remove_signal",
    description: "入金 → 未払・期限超過シグナル除去",
  },
  {
    eventType: "payment.completed",
    affectedSources: ["dashboard", "job", "customer"],
    effect: "remove_signal",
    description: "支払完了 → 入金確認シグナル除去",
  },

  // ── 証明書 ──
  {
    eventType: "certificate.issued",
    affectedSources: ["dashboard", "job", "customer"],
    effect: "update_signal",
    description: "証明書発行 → 発行漏れシグナル除去、保証切れ監視開始",
  },
  {
    eventType: "certificate.voided",
    affectedSources: ["dashboard", "job", "customer"],
    effect: "add_signal",
    description: "証明書無効化 → 再発行シグナル追加",
  },

  // ── 顧客 ──
  {
    eventType: "customer.created",
    affectedSources: ["customer"],
    effect: "add_signal",
    description: "新規顧客 → 車両登録シグナル追加",
  },

  // ── AI ──
  {
    eventType: "ai.auto_action_executed",
    affectedSources: ["job"],
    effect: "update_signal",
    description: "AI 自動アクション実行 → ジョブ次アクション再計算",
  },
  {
    eventType: "ai.suggestion_applied",
    affectedSources: ["job"],
    effect: "update_signal",
    description: "AI 提案適用 → ジョブ次アクション再計算",
  },

  // ── 進捗 ──
  {
    eventType: "progress.updated",
    affectedSources: ["dashboard", "job"],
    effect: "update_signal",
    description: "進捗更新 → 作業中タイル / ジョブ次アクション再計算",
  },
] as const;

// ── 純関数 ──

const _triggerIndex = new Map<DomainEventType, PriorityTrigger>();
for (const t of PRIORITY_TRIGGERS) {
  _triggerIndex.set(t.eventType, t);
}

/**
 * ドメインイベントが優先度に影響するか判定する。
 */
export function isPriorityAffecting(eventType: DomainEventType): boolean {
  return _triggerIndex.has(eventType);
}

/**
 * ドメインイベントの優先度トリガー情報を取得する。
 * 優先度に無関係なイベントには null を返す。
 */
export function getPriorityTrigger(eventType: DomainEventType): PriorityTrigger | null {
  return _triggerIndex.get(eventType) ?? null;
}

/**
 * DomainEvent から PriorityRecalcRequest を生成する。
 *
 * 優先度に無関係なイベントには null を返す。
 * ponytail: キューイングは呼び出し側の責任。
 */
export function toPriorityRecalcRequest(event: DomainEvent): PriorityRecalcRequest | null {
  const trigger = getPriorityTrigger(event.type);
  if (!trigger) return null;

  return {
    eventType: event.type,
    tenantId: event.tenantId,
    entityId: event.subject?.id,
    targetSources: trigger.affectedSources,
    triggeredAt: event.occurredAt,
  };
}
