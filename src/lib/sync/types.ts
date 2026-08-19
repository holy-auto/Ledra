/**
 * 同期キュー型定義（IMP-016）。
 *
 * v2.0 §14: 既存の OutboxItem（IndexedDB キュー）と正準 SyncState（IMP-001）を
 * 接続する型レイヤ。同期キュー・競合検出・解決戦略の型を定義する。
 *
 * 既存インフラ（src/lib/outbox/）は変更しない。ここでは上位の型契約のみ定義し、
 * 消費側（IMP-032 SYNC_CENTER 画面、IMP-023 作業エビデンス等）が利用する。
 */

import type { SyncState } from "@/lib/domain/states";

// ── 同期キューアイテム ──

/**
 * 同期対象リソースの種別。
 *
 * ponytail: OutboxKind（5 種、UI アイコン分岐用）は実装レベルの分類。
 * SyncResourceType はドメインレベルの分類で、SYNC_CENTER 画面のフィルタ・
 * 競合解決戦略の選択に使う。拡張時はここに追加。
 */
export type SyncResourceType =
  | "certificate"
  | "certificate_image"
  | "reservation"
  | "customer"
  | "invoice"
  | "vehicle"
  | "part_installation"
  | "work_step";

/**
 * 同期キューアイテム。
 *
 * OutboxItem を包み、ドメインレベルの追跡情報を付加する。
 * outboxItemId は既存 IndexedDB outbox の id への参照。
 *
 * ponytail: 実ストレージ（IndexedDB の OutboxItem）とは別オブジェクト。
 * 実装上は OutboxItem の拡張 wrapper として扱い、IDB に新ストアを作らない。
 * メモリ上のビューとして listOutbox() → mapToSyncQueueItem() で生成。
 */
export type SyncQueueItem = {
  /** 既存 OutboxItem.id への参照。 */
  outboxItemId: string;
  /** 対象リソースの種別。 */
  resourceType: SyncResourceType;
  /** 対象リソースの ID（例: certificate の public_id）。 */
  resourceId: string;
  /** 現在の同期状態。 */
  syncState: SyncState;
  /** テナント ID。クロステナント安全性のため必須。 */
  tenantId: string;
  /** unix ms。 */
  createdAt: number;
  /** 直近の同期試行時刻（unix ms）。未試行なら null。 */
  lastSyncAt: number | null;
  /** 試行回数。 */
  attempts: number;
  /** 直近エラー。 */
  lastError: string | null;
  /** 競合が検出された場合の詳細。 */
  conflict: SyncConflict | null;
};

// ── 競合（Conflict）──

/**
 * 競合の種類。
 *
 * v2.0 §14 ではサーバ版が新しい場合の「楽観的同期」失敗のみ想定。
 * 将来的にはフィールドレベルマージ等の拡張が考えられるが、
 * 現段階では 3 種類で足りる。
 */
export type ConflictKind =
  /** サーバ側が更新されており、クライアントの変更と衝突。 */
  | "version_mismatch"
  /** サーバ側でリソースが削除されている。 */
  | "resource_deleted"
  /** 同一リソースへの複数の未同期変更がキューにある。 */
  | "duplicate_pending";

/**
 * 競合の詳細情報。
 *
 * SYNC_CENTER 画面での競合表示・解決 UI に使う。
 */
export type SyncConflict = {
  kind: ConflictKind;
  /** 検出時刻（unix ms）。 */
  detectedAt: number;
  /**
   * サーバ側の版番号またはタイムスタンプ。
   * version_mismatch の場合のみ意味を持つ。
   */
  serverVersion?: string;
  /**
   * クライアント側の版番号またはタイムスタンプ。
   */
  clientVersion?: string;
  /** 競合の説明（UI 表示用）。 */
  description: string;
};

// ── 競合解決戦略 ──

/**
 * 競合解決の方針。
 *
 * 解決策の選択は SYNC_CENTER UI でユーザーが行うか、
 * リソースタイプごとのデフォルト戦略で自動解決する。
 */
export type ConflictResolutionStrategy =
  /** クライアントの変更を優先（サーバを上書き）。 */
  | "client_wins"
  /** サーバの状態を優先（クライアントの変更を破棄）。 */
  | "server_wins"
  /** ユーザーに手動解決を促す。 */
  | "manual"
  /** 再試行（一時的な競合の場合）。 */
  | "retry";

/**
 * 競合解決の結果。
 */
export type ConflictResolution = {
  conflict: SyncConflict;
  strategy: ConflictResolutionStrategy;
  /** 解決時刻（unix ms）。 */
  resolvedAt: number;
  /** 解決者（ユーザー操作 or 自動）。 */
  resolvedBy: "user" | "auto";
};

// ── 同期サマリー ──

/**
 * 同期状態のサマリー（UI バッジ・SYNC_CENTER ヘッダ用）。
 *
 * 既存の countOutbox() を拡張し、状態別の件数を提供する。
 */
export type SyncSummary = {
  /** 総キュー件数。 */
  total: number;
  /** 同期待ち（PENDING）。 */
  pending: number;
  /** 同期中（SYNCING）。 */
  syncing: number;
  /** 失敗（FAILED）。 */
  failed: number;
  /** 競合あり（CONFLICT）。 */
  conflicted: number;
  /** 最も古い未同期アイテムの作成時刻。null ならキュー空。 */
  oldestPendingSince: number | null;
};
