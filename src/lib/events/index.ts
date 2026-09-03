/**
 * ドメインイベント基盤（IMP-014）。
 *
 * 統一イベントカタログ・エンベロープ型・リスク推定。
 * 既存の audit / outbox / webhook-topics は変更せず、
 * 段階的移行のための型と LEGACY_EVENT_MAP を提供する。
 */

export {
  // カタログ
  DOMAIN_EVENT_TYPES,
  type DomainEventType,
  type EventResource,
  isDomainEventType,
  eventTypesForResource,
  LEGACY_EVENT_MAP,
  fromLegacyEventType,
} from "./catalogue";

export {
  // イベント型
  type EventActor,
  type DomainEvent,
  type CreateDomainEventInput,
  createDomainEvent,
  eventRisk,
} from "./domainEvent";
