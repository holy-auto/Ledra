/**
 * IMP-050: エクスポート監査イベント（v2.0 §18）。
 *
 * 4 つのデータエクスポートルート（admin/customer/agent/insurer）の
 * 実行を統一フォーマットで記録するための型と純関数。
 *
 * 現状: admin export のみ vehicle_histories に best-effort 記録。
 * 本モジュールで構造化し、将来の専用テーブル or ドメインイベント
 * カタログへの統合に備える。
 *
 * 純関数。IO なし。
 */

// ── エクスポートスコープ ──

export const EXPORT_SCOPES = ["admin", "customer", "agent", "insurer"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

// ── 権限動詞定数 ──

/**
 * エクスポート用の権限動詞。
 * IMP-013 permission engine への将来追加に備えた定数。
 * ponytail: 現時点では requireMinRole で代用。追加時はこの定数を使う。
 */
export const EXPORT_PERMISSION_VERB = "data:export" as const;

// ── エクスポート監査イベント ──

export interface DataExportEvent {
  /** イベント種別 */
  type: "data_export";
  /** エクスポートスコープ */
  scope: ExportScope;
  /** 実行者 ID（user_id / customer_id / agent_id / insurer_user_id） */
  actorId: string;
  /** テナント/スコープ ID */
  scopeId: string;
  /** エクスポートに含まれたテーブル */
  tablesIncluded: readonly string[];
  /** 各テーブルのおおよその行数 */
  rowCounts?: Readonly<Record<string, number>>;
  /** エクスポート形式 */
  format: "json";
  /** ISO 8601 タイムスタンプ */
  exportedAt: string;
  /** スキーマバージョン */
  schemaVersion: string;
  /** リクエスト元 IP（レート制限と突合用） */
  requestIp?: string;
}

/**
 * エクスポート監査エントリを生成する純関数。
 *
 * 呼び出し側（各 export route）が必要なフィールドを渡し、
 * 正規化されたイベントオブジェクトを受け取る。
 *
 * tablesIncluded/rowCounts は呼び出し側のミュータブルな配列/オブジェクトを
 * 参照ではなくコピーして保持する。参照のまま保持すると、呼び出し側が
 * 生成後（永続化前）に同じ配列/オブジェクトを再利用・変更した場合、
 * 「そのはずの」監査記録の中身が後から変わってしまう（Codex レビュー指摘）。
 */
export function createExportAuditEntry(input: {
  scope: ExportScope;
  actorId: string;
  scopeId: string;
  tablesIncluded: readonly string[];
  rowCounts?: Readonly<Record<string, number>>;
  exportedAt: string;
  schemaVersion?: string;
  requestIp?: string;
}): DataExportEvent {
  return {
    type: "data_export",
    scope: input.scope,
    actorId: input.actorId,
    scopeId: input.scopeId,
    tablesIncluded: [...input.tablesIncluded],
    rowCounts: input.rowCounts ? { ...input.rowCounts } : undefined,
    format: "json",
    exportedAt: input.exportedAt,
    schemaVersion: input.schemaVersion ?? "1.0",
    requestIp: input.requestIp,
  };
}

// ── エクスポート頻度チェック ──

/**
 * 直近のエクスポート履歴から異常パターンを検出する純関数。
 *
 * ponytail: 現時点では単純な頻度チェック。
 * 1 時間以内に maxPerHour 回超のエクスポートがあれば警告対象。
 */
export function detectAbnormalExportFrequency(
  recentExports: readonly { exportedAt: string }[],
  referenceTime: string,
  maxPerHour = 3,
): { isAbnormal: boolean; countInWindow: number } {
  const refMs = new Date(referenceTime).getTime();
  const oneHourMs = 60 * 60 * 1000;
  const windowStart = refMs - oneHourMs;

  const countInWindow = recentExports.filter((e) => {
    const t = new Date(e.exportedAt).getTime();
    return t >= windowStart && t <= refMs;
  }).length;

  return { isAbnormal: countInWindow > maxPerHour, countInWindow };
}
