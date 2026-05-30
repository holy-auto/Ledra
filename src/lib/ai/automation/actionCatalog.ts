/**
 * AI 自動「アクション」カタログ — single source of truth。
 *
 * fieldCatalog.ts が「フィールドを AI が埋めるか」を制御するのに対し、
 * このカタログは「人がトリガーを引かなくてもワークフローを前に進めるか」
 * (= イベント駆動の自動実行) を制御する。
 *
 * 用語:
 *   - **auto-action**: 受信 webhook / 状態遷移などをきっかけに、人の操作なしで
 *     AI 処理 (抽出・下書き生成・自動起票) を走らせること。
 *   - **NEVER_AUTO_ACTIONS (壁3)**: 法的責任・金額の外向き確定を伴うため、
 *     テナントが設定で true にしても **絶対に自動実行しない** アクション。
 *     必ず人の最終確認を挟む。`resolveAutoAction` (policy.ts) がここを強制する。
 *
 * 設計方針:
 *   - すべての auto-action は **デフォルト OFF** (defaultEnabled=false)。
 *     既存テナントの挙動を勝手に変えない。管理者が明示的に opt-in して初めて
 *     自動実行される ("AI が提案、人が承認" という既存の保守的デフォルトと整合)。
 *   - キーは `tenant_ai_automation_settings.auto_actions` に永続化される。
 *     rename は移行を伴うので不可。追加は末尾に。
 *   - ピュアデータモジュール (no JSX, no server-only import)。
 */

import type { AutomationWorkflowKey } from "./fieldCatalog";

/** opt-in 可能な auto-action のキー (壁3 は含めない)。 */
export type AutomationActionKey =
  | "inbound_message.auto_extract"
  | "inbound_message.auto_create_reservation"
  | "certificate.auto_draft"
  | "review.auto_analyze"
  | "translation.auto_translate";

export interface AutomationActionDef {
  key: AutomationActionKey;
  workflow: AutomationWorkflowKey;
  label: string;
  description: string;
  /** 既定は必ず false (opt-in)。 */
  defaultEnabled: false;
  /**
   * このアクションが自動コミットする際、追加で満たすべき前提の説明 (UI 用)。
   * 実際のガードは orchestrator / inboundAuto 側で実装する。
   */
  guard?: string;
}

export const AUTOMATION_ACTIONS: readonly AutomationActionDef[] = [
  {
    key: "inbound_message.auto_extract",
    workflow: "inbound_message",
    label: "受信メッセージを自動でAI抽出",
    description:
      "LINE 等で顧客メッセージを受信した時点で予約候補を自動抽出し、受信箱に下書きとして用意する。作成・送信は行わないため安全 (人は1タップで確定)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + confidence 閾値",
  },
  {
    key: "inbound_message.auto_create_reservation",
    workflow: "inbound_message",
    label: "受信メッセージから予約を自動起票",
    description:
      "予約意図かつ高確信、さらに既知顧客に紐づく場合のみ予約を自動作成する。新規顧客 (本人確認) の自動作成はしない。タイトルに【要確認】を付与。",
    defaultEnabled: false,
    guard: "intent=new_reservation + confidence≥閾値 + 既知顧客 + 有効な希望日",
  },
  {
    key: "certificate.auto_draft",
    workflow: "certificate",
    label: "写真・音声が揃ったら証明書ドラフトを自動生成",
    description:
      "案件に施工写真と音声メモが揃った時点で証明書の下書きを自動生成する。発行 (法的確定) は行わない — 発行は必ず人が確認する (壁3)。",
    defaultEnabled: false,
    guard: "写真あり + 音声メモあり + confidence≥閾値",
  },
  {
    key: "review.auto_analyze",
    workflow: "review",
    label: "レビュー受信時に感情分析を自動実行",
    description: "レビュー / NPS を受信した時点でセンチメントと要約を自動付与する。注釈用途のため安全。",
    defaultEnabled: false,
  },
  {
    key: "translation.auto_translate",
    workflow: "translation",
    label: "お知らせ保存時に多言語へ自動翻訳",
    description: "店舗お知らせを保存した時点で英・中・越へ自動翻訳する (翻訳キャッシュ利用)。",
    defaultEnabled: false,
  },
];

/**
 * 壁3 — 法的責任 / 金額の外向き確定を伴うため、設定に関わらず
 * **絶対に自動実行しない** アクション。`resolveAutoAction` が常に false を返す。
 * sanitizer もこれらのキーを true で永続化させない (二重ガード)。
 */
export const NEVER_AUTO_ACTIONS: ReadonlySet<string> = new Set<string>([
  "certificate.auto_issue", // 証明書の発行 (法的責任)
  "invoice.auto_send", // 請求書の外向き送付 (金額)
  "invoice.auto_finalize", // 請求の確定 (金額)
  "payment.auto_charge", // 自動課金 (金額)
  "quote.auto_send", // 見積の外向き送付 (金額)
  "customer.auto_create", // 顧客 (本人) レコードの自動作成 (本人確認)
]);

export const AUTOMATION_ACTION_BY_KEY: ReadonlyMap<string, AutomationActionDef> = new Map(
  AUTOMATION_ACTIONS.map((a) => [a.key, a]),
);

export const AUTOMATION_ACTION_KEYS: ReadonlySet<string> = new Set(AUTOMATION_ACTIONS.map((a) => a.key));

/** opt-in 可能な (カタログに存在する) アクションキーか。 */
export function isKnownActionKey(key: unknown): key is AutomationActionKey {
  return typeof key === "string" && AUTOMATION_ACTION_KEYS.has(key);
}

/** 壁3 (絶対に自動実行しない) アクションか。 */
export function isNeverAutoAction(key: unknown): boolean {
  return typeof key === "string" && NEVER_AUTO_ACTIONS.has(key);
}

/**
 * 任意の入力を `Record<actionKey, boolean>` に正規化する。
 * - 未知キー / boolean 以外は捨てる
 * - **壁3 アクションは true でも捨てる** (永続化させない)
 * - false は冗長なので捨てる (未設定 = 既定 OFF と同義)
 */
export function sanitizeAutoActions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownActionKey(k)) continue;
    if (isNeverAutoAction(k)) continue;
    if (typeof v !== "boolean") continue;
    if (v === false) continue;
    out[k] = true;
  }
  return out;
}
