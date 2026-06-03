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
  | "certificate.auto_create_draft_record"
  | "review.auto_analyze"
  | "translation.auto_translate"
  | "invoice.auto_send_on_confirm"
  | "quote.auto_send_on_confirm"
  | "accounting.auto_categorize_on_intake"
  | "invoice.auto_draft_on_billing_step"
  | "thickness.auto_detect"
  | "workflow.auto_propose_on_intake"
  | "workflow.auto_apply_on_intake"
  | "inventory.auto_draft_reorder"
  | "photo.auto_tampering_check"
  | "insurer_case.auto_fraud_score";

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
    key: "certificate.auto_create_draft_record",
    workflow: "certificate",
    label: "案件完了で証明書を下書き(draft)として自動作成",
    description:
      "案件完了 + 車両ありの時点で、AI 下書きを基に証明書レコードを status=draft で自動作成し発行直前まで用意する。発行 (draft→active = 法的確定) は必ず人が 1 タップで行う (壁3)。既に証明書がある案件は作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 案件完了 + 車両あり + 既存証明書なし",
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
  {
    key: "invoice.auto_send_on_confirm",
    workflow: "invoice",
    label: "請求書を確定したら自動送付",
    description:
      "下書きの請求書を人が「確定 (送付済みに変更)」した時点で、顧客に自動送付する。LINE 連携があれば LINE、無ければメールを自動選択し、決済リンク (Stripe Connect) と書類の両方を届ける。金額の確定そのものは必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 人が draft→sent に確定 + 顧客に LINE もしくはメールあり",
  },
  {
    key: "quote.auto_send_on_confirm",
    workflow: "quote",
    label: "見積書を確定したら自動送付",
    description:
      "下書きの見積書を人が「確定 (送付済みに変更)」した時点で、顧客に自動送付する。LINE 連携があれば LINE、無ければメールを自動選択して書類リンクを届ける。内容の確定そのものは必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 人が draft→sent に確定 + 顧客に LINE もしくはメールあり",
  },
  {
    key: "accounting.auto_categorize_on_intake",
    workflow: "accounting",
    label: "案件登録時に勘定科目を自動推定(提案)",
    description:
      "案件 (予約) が登録された時点で、メニュー明細から freee / マネーフォワード の勘定科目を自動推定し、提案として保存する。確定 (帳簿への計上) は行わない — 金額・科目の確定は必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 会計連携設定済み + メニュー明細あり",
  },
  {
    key: "invoice.auto_draft_on_billing_step",
    workflow: "invoice",
    label: "ワークフローの会計工程で請求書ドラフトを自動作成",
    description:
      "ワークフローが「会計/請求」工程に到達した時点で、予約のメニュー（無ければ見積額）から請求書を status=draft で自動起票する。送付（金額の外向き確定）は必ず人が行う（壁3）。同じ顧客の下書きが既にあれば作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 顧客あり + 金額の手掛かりあり",
  },
  {
    key: "thickness.auto_detect",
    workflow: "inventory",
    label: "塗膜厚レポート受信時に異常検知を自動実行",
    description:
      "NexPTG 等から塗膜厚レポートを受信した時点で統計的な異常検知 (外れ値 / 値域逸脱) を自動実行し、結果を注釈として保存する。金額・本人確認・法的確定に関与しないため安全。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上",
  },
  {
    key: "workflow.auto_propose_on_intake",
    workflow: "job",
    label: "案件登録時に最適なワークフローをAI提案",
    description:
      "案件 (予約) が登録された時点で、メニュー内容と顧客の過去施工履歴から最適なワークフローテンプレートを AI が提案する。提案を保存するだけで自動適用はしない — スタッフが承認 (または別テンプレートに変更) してから進行する (人が判断)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + ワークフローテンプレート登録済み",
  },
  {
    key: "workflow.auto_apply_on_intake",
    workflow: "job",
    label: "案件登録時にAI提案のワークフローを自動適用",
    description:
      "AI 提案 (workflow.auto_propose_on_intake) の最有力テンプレートを案件に自動で割り当て、ワークフローを開始する。テンプレートを手で組まなくても工程が走る。割り当てるだけで各工程の進行・確定は人が行う。スタッフはいつでも別テンプレートへ変更可能。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + workflow.auto_propose_on_intake 有効 + 一致テンプレートあり",
  },
  {
    key: "inventory.auto_draft_reorder",
    workflow: "inventory",
    label: "在庫が下限を切ったら発注書ドラフトを自動作成",
    description:
      "日次の在庫チェックで現在庫が下限 (min_stock) を下回った品目について、仕入先ごとに発注書を status=draft で自動起票する。発注の承認・送信 (仕入先への金額コミット) は必ず人が行う — 自動で発注を確定・送信することはしない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 品目に仕入先 (supplier_id) が設定済み",
  },
  {
    key: "photo.auto_tampering_check",
    workflow: "certificate",
    label: "証明書写真の改ざんスクリーニングを自動実行",
    description:
      "施工写真がアップロードされた時点で、アップロード時に取得済みのシグナル (ハッシュ重複 / ディープフェイク判定 / 撮影メタ) を証明書単位の改ざん判定に集約し、注釈として保存する。発行・金額・本人確認には関与しないため安全 (人は発行前にフラグを確認できる)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_quality_vision)",
  },
  {
    key: "insurer_case.auto_fraud_score",
    workflow: "insurer_case",
    label: "保険案件の受信時に不正リスクを自動スコア",
    description:
      "保険案件 (claim) が作成された時点で、ルールベース一次判定 + グレーゾーンのみ AI で不正リスクを自動評価し、注釈として案件に保存する。査定の確定は必ず人が行う (リスク提示のみ・壁3 不介入)。",
    defaultEnabled: false,
    guard: "AI 有効 + 案件にテナント紐付けあり (証明書/車両/契約経由)",
  },
];

/**
 * 壁3 — 法的責任 / 金額の外向き確定を伴うため、設定に関わらず
 * **絶対に自動実行しない** アクション。`resolveAutoAction` が常に false を返す。
 * sanitizer もこれらのキーを true で永続化させない (二重ガード)。
 */
export const NEVER_AUTO_ACTIONS: ReadonlySet<string> = new Set<string>([
  "certificate.auto_issue", // 証明書の発行 (法的責任)
  "invoice.auto_send", // 人の確認を一切挟まない請求書の外向き送付 (= 無ゲート送付)。禁止。
  // → 「人が draft→sent に確定した後」だけ送る `invoice.auto_send_on_confirm` は opt-in 可 (壁3 ではない)。
  "invoice.auto_finalize", // 請求の確定 (金額) — 確定そのものは必ず人。
  "payment.auto_charge", // 自動課金 (金額)
  "quote.auto_send", // 人の確認を一切挟まない見積の外向き送付。禁止。
  // → 「人が確定した後」だけ送る `quote.auto_send_on_confirm` は opt-in 可。
  "customer.auto_create", // スタッフ操作だけでの顧客 (本人) レコード自動作成 (本人確認)。
  // → 顧客本人が OCR 内容を確認して確定する公開 intake フロー (submitAndProcessIntake) は本人確認が成立するため別扱い。
]);

export const AUTOMATION_ACTION_BY_KEY: ReadonlyMap<string, AutomationActionDef> = new Map(
  AUTOMATION_ACTIONS.map((a) => [a.key, a]),
);

export const AUTOMATION_ACTION_KEYS: ReadonlySet<string> = new Set(AUTOMATION_ACTIONS.map((a) => a.key));

/**
 * 「おまかせ運用」プリセットで一括 ON にする推奨アクション。
 *
 * 下書き / 提案 / 注釈の生成だけで、外向き送付・自動作成（予約/送付）を伴わない
 * = 失敗しても影響が小さく取り消しやすいものに限定する。顧客への自動送付
 * (invoice/quote.auto_send_on_confirm) や予約の自動起票
 * (inbound_message.auto_create_reservation) は意図的に**除外**し、個別 opt-in に委ねる。
 * 壁3 アクションは元々カタログ外なので含まれない。
 */
export const RECOMMENDED_AUTOMATION_ACTION_KEYS: ReadonlySet<string> = new Set<string>([
  "inbound_message.auto_extract",
  "certificate.auto_draft",
  "certificate.auto_create_draft_record",
  "review.auto_analyze",
  "translation.auto_translate",
  "accounting.auto_categorize_on_intake",
  "thickness.auto_detect",
  "workflow.auto_propose_on_intake",
  "workflow.auto_apply_on_intake",
  "inventory.auto_draft_reorder",
  "photo.auto_tampering_check",
  "insurer_case.auto_fraud_score",
]);

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
