/**
 * AI 自動入力カタログ — workflow / field の単一の真実 (single source of truth)。
 *
 * 既存の AI ヘルパー (`src/lib/ai/draftCertificate.ts`,
 * `src/lib/ai/identityOcr.ts`, `src/lib/ai/voiceMemoReformat.ts`,
 * `src/lib/ocr/shakensho.ts`) が抽出するフィールドを、
 * ユーザが UI で「auto / suggest / manual」に切替可能な単位に正規化したもの。
 *
 * - `workflow` は設定ページのアコーディオン区切りに使う
 * - `key` は `tenant_ai_automation_settings.field_policies` に永続化される
 * - `key` の rename は移行を伴うので不可。新しい AI 出力フィールドを追加する
 *   ときは末尾に追記し、既存キーは触らない
 *
 * ピュアデータモジュール (no JSX, no server-only import) なので、サイドバー /
 * 設定 UI / API ルート / AI ヘルパーから同じ catalog を共有できる。
 */

export type FieldPolicy = "auto" | "suggest" | "manual";

export const DEFAULT_FIELD_POLICY: FieldPolicy = "suggest";

/** ワークフロー (UI 上のグループ単位)。 */
export type AutomationWorkflowKey =
  | "certificate"
  | "vehicle"
  | "customer_intake"
  | "job"
  | "invoice"
  | "quote"
  | "accounting"
  | "inquiry"
  | "inbound_message"
  | "review"
  | "insurer_case"
  | "master_data"
  | "inventory"
  | "menu"
  | "market_vehicle"
  | "translation";

export interface AutomationWorkflowDef {
  key: AutomationWorkflowKey;
  label: string;
  description: string;
}

export const AUTOMATION_WORKFLOWS: readonly AutomationWorkflowDef[] = [
  {
    key: "certificate",
    label: "施工証明書発行",
    description: "AI 下書き・写真説明・音声メモ整形から証明書の各欄を自動入力",
  },
  {
    key: "vehicle",
    label: "車両登録 (車検証 OCR)",
    description: "電子車検証 / 写真 OCR から車両情報を自動入力",
  },
  {
    key: "customer_intake",
    label: "顧客 intake / ヒアリング",
    description: "身分証 OCR・音声メモ・問い合わせ本文から顧客情報を自動抽出",
  },
  {
    key: "job",
    label: "案件 (Job) ワークフロー",
    description: "予約 → 来店 → 作業 → 証明書 の遷移時に次手フィールドを AI が下書き",
  },
  {
    key: "invoice",
    label: "請求書作成",
    description: "案件 → 請求書 の AI 起票 (宛名 / 備考 / 明細)",
  },
  {
    key: "quote",
    label: "見積書作成",
    description: "車両 + 過去類似請求書から見積書を AI 起票",
  },
  {
    key: "accounting",
    label: "会計仕訳",
    description: "請求書明細から freee / マネーフォワード の勘定科目を推定",
  },
  {
    key: "inquiry",
    label: "顧客問い合わせ",
    description: "受信問い合わせの自動分類 + 返信下書き",
  },
  {
    key: "inbound_message",
    label: "受信メッセージ → 予約",
    description: "LINE / メール本文から予約フォームを自動入力",
  },
  {
    key: "review",
    label: "顧客レビュー / NPS",
    description: "受信レビューのセンチメント解析と要約",
  },
  {
    key: "insurer_case",
    label: "保険会社 案件管理",
    description: "案件の自動振り分け + 1 文サマリ",
  },
  {
    key: "master_data",
    label: "マスタ正規化",
    description: "メーカー / 住所 / 顧客名などの表記揺れ吸収",
  },
  {
    key: "inventory",
    label: "在庫 / 品目",
    description: "POS 引落 / 推奨価格 / 塗膜厚異常検知",
  },
  {
    key: "menu",
    label: "メニュー価格",
    description: "車両サイズ × 相場から推奨価格を提示",
  },
  {
    key: "market_vehicle",
    label: "マーケット車両説明文",
    description: "写真 + 仕様から物件説明文を自動生成",
  },
  {
    key: "translation",
    label: "多言語化 (i18n)",
    description: "店舗お知らせや製品説明を英 / 中 / ベトナム語に翻訳",
  },
];

/** AI が参照可能な情報ソース。 */
export type AutomationSourceKey =
  | "similar_certificates"
  | "hearings"
  | "photos"
  | "customer_history"
  | "voice_memo"
  | "identity_documents";

export interface AutomationSourceDef {
  key: AutomationSourceKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const AUTOMATION_SOURCES: readonly AutomationSourceDef[] = [
  {
    key: "similar_certificates",
    label: "過去の類似施工事例",
    description: "同テナントの過去証明書 (最新 5 件) をプロンプトに含める",
    defaultEnabled: true,
  },
  {
    key: "hearings",
    label: "ヒアリングフォーム",
    description: "事前ヒアリング (希望施工・予算・駐車環境・顧客要望) を参照",
    defaultEnabled: true,
  },
  {
    key: "photos",
    label: "施工写真 (Vision)",
    description: "施工前後の写真を Vision モデルで解析して説明を抽出",
    defaultEnabled: true,
  },
  {
    key: "customer_history",
    label: "顧客の来店・施工履歴",
    description: "顧客 360° タイムラインを参照して次手を提案",
    defaultEnabled: true,
  },
  {
    key: "voice_memo",
    label: "音声メモ",
    description: "現場スタッフの音声メモを文字起こし・整形して反映",
    defaultEnabled: true,
  },
  {
    key: "identity_documents",
    label: "身分証 / 車検証 OCR",
    description: "Vision OCR で書類画像からフィールドを抽出",
    defaultEnabled: true,
  },
];

export interface AutomationFieldDef {
  /** Stable identifier. Persisted as JSON key in field_policies. Never rename. */
  key: string;
  workflow: AutomationWorkflowKey;
  label: string;
  /** UI でフィールドの意味を補足する短文 (一覧の <small> 行)。 */
  hint?: string;
  /** ポリシー未設定時のデフォルト。テナントが何もいじっていない素の挙動。 */
  defaultPolicy: FieldPolicy;
  /** このフィールドの抽出に使われる主たるソース (UI の「使われている情報源」表示用)。 */
  sources: AutomationSourceKey[];
}

export const AUTOMATION_FIELDS: readonly AutomationFieldDef[] = [
  // ─── 施工証明書 ─────────────────────────────────────────
  {
    key: "certificate.title",
    workflow: "certificate",
    label: "施工タイトル",
    hint: "20 文字以内の見出し (例: ガラスコーティング施工)",
    defaultPolicy: "suggest",
    sources: ["similar_certificates", "hearings"],
  },
  {
    key: "certificate.description",
    workflow: "certificate",
    label: "施工内容説明",
    hint: "100〜200 文字の本文。専門用語と顧客向け表現のバランス",
    defaultPolicy: "suggest",
    sources: ["similar_certificates", "hearings", "photos", "voice_memo"],
  },
  {
    key: "certificate.materials",
    workflow: "certificate",
    label: "使用材料リスト",
    hint: "材料名・メーカー・規格・備考",
    defaultPolicy: "suggest",
    sources: ["similar_certificates", "hearings"],
  },
  {
    key: "certificate.warranty",
    workflow: "certificate",
    label: "保証期間候補",
    hint: "1 年 / 3 年 / 5 年 などの候補ボタン",
    defaultPolicy: "suggest",
    sources: ["similar_certificates"],
  },
  {
    key: "certificate.work_areas",
    workflow: "certificate",
    label: "施工箇所",
    hint: "ボンネット / ルーフ / フード 等",
    defaultPolicy: "suggest",
    sources: ["photos", "hearings"],
  },
  {
    key: "certificate.cautions",
    workflow: "certificate",
    label: "注意事項",
    hint: "車種・施工固有のメンテ注意 (任意)",
    defaultPolicy: "manual",
    sources: ["similar_certificates"],
  },

  // ─── 車両登録 (車検証 OCR) ─────────────────────────────
  {
    key: "vehicle.maker",
    workflow: "vehicle",
    label: "メーカー",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.model",
    workflow: "vehicle",
    label: "車種",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.year",
    workflow: "vehicle",
    label: "年式",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.vin",
    workflow: "vehicle",
    label: "車体番号 (VIN)",
    hint: "保険会社の照会キーになる重要項目",
    defaultPolicy: "suggest",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.plate_display",
    workflow: "vehicle",
    label: "ナンバー表示",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.size_class",
    workflow: "vehicle",
    label: "車両サイズ (SS〜XL)",
    hint: "車検証寸法から自動算出。施工料金の根拠になる",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.expiry_date",
    workflow: "vehicle",
    label: "車検満了日",
    hint: "車検証 OCR の日付。金額・本人確認に関わらないため既定 auto",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.fuel_type",
    workflow: "vehicle",
    label: "燃料種別",
    hint: "車検証 OCR の派生値。既定 auto",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },

  // ─── 顧客 intake ─────────────────────────────────────
  {
    key: "customer.name",
    workflow: "customer_intake",
    label: "氏名",
    hint: "身分証 OCR / 音声メモから抽出。KYC ではなくフォーム補助",
    defaultPolicy: "suggest",
    sources: ["identity_documents", "voice_memo"],
  },
  {
    key: "customer.name_kana",
    workflow: "customer_intake",
    label: "氏名 (カナ)",
    defaultPolicy: "suggest",
    sources: ["identity_documents"],
  },
  {
    key: "customer.birth_date",
    workflow: "customer_intake",
    label: "生年月日",
    defaultPolicy: "suggest",
    sources: ["identity_documents"],
  },
  {
    key: "customer.address",
    workflow: "customer_intake",
    label: "住所",
    defaultPolicy: "suggest",
    sources: ["identity_documents", "voice_memo"],
  },
  {
    key: "customer.postal_code",
    workflow: "customer_intake",
    label: "郵便番号",
    defaultPolicy: "auto",
    sources: ["identity_documents"],
  },
  {
    key: "customer.phone",
    workflow: "customer_intake",
    label: "電話番号",
    hint: "本人確認の鍵になるので suggest 推奨",
    defaultPolicy: "suggest",
    sources: ["voice_memo"],
  },
  {
    key: "customer.email",
    workflow: "customer_intake",
    label: "メールアドレス",
    defaultPolicy: "suggest",
    sources: ["voice_memo"],
  },
  {
    key: "customer.requests",
    workflow: "customer_intake",
    label: "顧客要望 (フリーテキスト)",
    defaultPolicy: "auto",
    sources: ["voice_memo", "hearings"],
  },

  // ─── 案件 (Job) ワークフロー ──────────────────────────
  {
    key: "job.title",
    workflow: "job",
    label: "案件タイトル",
    hint: "予約・飛び込み案件起票時に AI が自動命名",
    defaultPolicy: "auto",
    sources: ["customer_history", "similar_certificates"],
  },
  {
    key: "job.menu_items",
    workflow: "job",
    label: "施工メニュー (推奨)",
    hint: "車両・ヒアリングから推奨メニューを並び替え",
    defaultPolicy: "suggest",
    sources: ["customer_history", "hearings", "similar_certificates"],
  },
  {
    key: "job.estimated_price",
    workflow: "job",
    label: "概算金額",
    hint: "メニュー × 車両サイズ × 過去相場",
    defaultPolicy: "suggest",
    sources: ["customer_history", "similar_certificates"],
  },
  {
    key: "job.estimated_duration",
    workflow: "job",
    label: "想定作業時間",
    hint: "過去事例からの所要時間目安。金額ではないため既定 auto",
    defaultPolicy: "auto",
    sources: ["similar_certificates"],
  },
  {
    key: "job.next_action",
    workflow: "job",
    label: "次アクション提案",
    hint: "現ステータスに応じた次手 (証明書発行 / 請求 / 顧客連絡)",
    defaultPolicy: "suggest",
    sources: ["customer_history"],
  },
  {
    key: "job.notes",
    workflow: "job",
    label: "備考メモ",
    hint: "音声メモ整形 (現場スタッフの口頭メモ → 文字起こし)",
    defaultPolicy: "suggest",
    sources: ["voice_memo"],
  },

  // ─── 請求書作成 ─────────────────────────────────────
  {
    key: "invoice.items",
    workflow: "invoice",
    label: "請求明細",
    hint: "案件メニュー / 概算金額から自動生成",
    defaultPolicy: "suggest",
    sources: ["customer_history"],
  },
  {
    key: "invoice.recipient_name",
    workflow: "invoice",
    label: "宛名 (様 / 御中)",
    defaultPolicy: "auto",
    sources: ["customer_history"],
  },
  {
    key: "invoice.note",
    workflow: "invoice",
    label: "備考 (対象車両など)",
    defaultPolicy: "auto",
    sources: ["customer_history"],
  },
  {
    key: "invoice.tax_rate",
    workflow: "invoice",
    label: "税率",
    defaultPolicy: "suggest",
    sources: ["similar_certificates"],
  },

  // ─── 見積書作成 ─────────────────────────────────────
  {
    key: "quote.items",
    workflow: "quote",
    label: "見積明細",
    defaultPolicy: "suggest",
    sources: ["similar_certificates", "customer_history"],
  },
  {
    key: "quote.terms",
    workflow: "quote",
    label: "条件文",
    defaultPolicy: "auto",
    sources: ["similar_certificates"],
  },
  {
    key: "quote.validity_days",
    workflow: "quote",
    label: "有効期限 (日数)",
    defaultPolicy: "auto",
    sources: [],
  },

  // ─── 会計仕訳 ───────────────────────────────────────
  {
    key: "accounting.category",
    workflow: "accounting",
    label: "勘定科目推定",
    hint: "明細ごとに freee / マネーフォワード の勘定コードを当てる",
    defaultPolicy: "suggest",
    sources: [],
  },

  // ─── 顧客問い合わせ ─────────────────────────────────
  {
    key: "inquiry.category",
    workflow: "inquiry",
    label: "問い合わせ分類",
    hint: "受信 → 技術 / 請求 / 予約 / 苦情 / その他",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "inquiry.priority",
    workflow: "inquiry",
    label: "優先度",
    defaultPolicy: "suggest",
    sources: [],
  },
  {
    key: "inquiry.draft_reply",
    workflow: "inquiry",
    label: "返信下書き",
    defaultPolicy: "suggest",
    sources: ["customer_history"],
  },

  // ─── 受信メッセージ → 予約 ───────────────────────────
  {
    key: "inbound_message.scheduled_date",
    workflow: "inbound_message",
    label: "希望日",
    defaultPolicy: "suggest",
    sources: [],
  },
  {
    key: "inbound_message.customer_name",
    workflow: "inbound_message",
    label: "顧客名",
    defaultPolicy: "suggest",
    sources: [],
  },
  {
    key: "inbound_message.vehicle",
    workflow: "inbound_message",
    label: "車両情報",
    defaultPolicy: "suggest",
    sources: [],
  },
  {
    key: "inbound_message.service_request",
    workflow: "inbound_message",
    label: "希望施工",
    defaultPolicy: "suggest",
    sources: [],
  },

  // ─── レビュー / NPS ─────────────────────────────────
  {
    key: "review.sentiment",
    workflow: "review",
    label: "センチメント (positive/neutral/negative)",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "review.summary",
    workflow: "review",
    label: "1 行サマリ",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "review.topics",
    workflow: "review",
    label: "話題タグ",
    hint: "レビュー本文からの自動タグ付け。注釈用途のため既定 auto",
    defaultPolicy: "auto",
    sources: [],
  },

  // ─── 保険会社 案件 ──────────────────────────────────
  {
    key: "insurer_case.assignee",
    workflow: "insurer_case",
    label: "担当者の自動振り分け",
    defaultPolicy: "suggest",
    sources: ["customer_history"],
  },
  {
    key: "insurer_case.summary",
    workflow: "insurer_case",
    label: "案件サマリ (3 行)",
    defaultPolicy: "auto",
    sources: ["customer_history"],
  },

  // ─── マスタ正規化 ──────────────────────────────────
  {
    key: "master_data.maker_model",
    workflow: "master_data",
    label: "メーカー / 車種の表記揺れ補正",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "master_data.address",
    workflow: "master_data",
    label: "住所 / 郵便番号の正規化",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "master_data.customer_fuzzy_match",
    workflow: "master_data",
    label: "顧客名のファジーマッチ (Square 注文紐付け)",
    defaultPolicy: "suggest",
    sources: ["customer_history"],
  },

  // ─── 在庫 / 品目 / 塗膜厚 ──────────────────────────
  {
    key: "inventory.pos_deduction",
    workflow: "inventory",
    label: "POS チェックアウト → 在庫引落",
    defaultPolicy: "suggest",
    sources: ["similar_certificates"],
  },
  {
    key: "inventory.thickness_anomaly",
    workflow: "inventory",
    label: "塗膜厚レポートの異常検知",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "menu.recommended_price",
    workflow: "menu",
    label: "推奨価格 (車両サイズ × 相場)",
    defaultPolicy: "suggest",
    sources: ["similar_certificates"],
  },

  // ─── マーケット車両 / 翻訳 ─────────────────────────
  {
    key: "market_vehicle.description",
    workflow: "market_vehicle",
    label: "物件説明文",
    defaultPolicy: "suggest",
    sources: ["photos"],
  },
  {
    key: "market_vehicle.features",
    workflow: "market_vehicle",
    label: "特徴タグ",
    defaultPolicy: "suggest",
    sources: ["photos"],
  },
  {
    key: "translation.announcement",
    workflow: "translation",
    label: "店舗お知らせの翻訳",
    defaultPolicy: "auto",
    sources: [],
  },
  {
    key: "translation.product_description",
    workflow: "translation",
    label: "製品説明の翻訳",
    defaultPolicy: "auto",
    sources: [],
  },
];

export const AUTOMATION_FIELD_BY_KEY: ReadonlyMap<string, AutomationFieldDef> = new Map(
  AUTOMATION_FIELDS.map((f) => [f.key, f]),
);

export const AUTOMATION_FIELD_KEYS: ReadonlySet<string> = new Set(AUTOMATION_FIELDS.map((f) => f.key));

/**
 * 壁3 (必ず人の確認を挟む) フィールド。
 *
 * 「金額確定」と「本人確認」に該当するフィールドは、テナントが設定で "auto" に
 * しても自動反映してはいけない (誤った請求・誤った本人情報は実損 / コンプラ
 * リスクに直結する)。`resolveFieldPolicy` がここに含まれるキーを必ず
 * "auto" → "suggest" にクランプする (manual はそのまま)。つまりこれらの
 * フィールドで AI が到達できる最大の自動化レベルは「提案 (要確認)」になる。
 *
 * - 低確信は confidenceThreshold によるデモートで別途担保される
 * - 法的責任を伴う「証明書の発行」自体はフィールドではなくアクションなので
 *   NEVER_AUTO_ACTIONS (actionCatalog.ts) 側で担保する
 */
export const NEVER_AUTO_FIELDS: ReadonlySet<string> = new Set<string>([
  // ── 金額確定 (money-final) ──
  "job.estimated_price",
  "invoice.items",
  "invoice.tax_rate",
  "quote.items",
  "menu.recommended_price",
  "accounting.category",
  "inventory.pos_deduction",
  // ── 本人確認 (identity) ──
  "customer.name",
  "customer.name_kana",
  "customer.birth_date",
  "customer.phone",
  "customer.email",
  "customer.address",
  "vehicle.vin",
]);

/** 壁3 フィールドか (金額確定 / 本人確認 — 必ず確認必須)。 */
export function isNeverAutoField(key: unknown): boolean {
  return typeof key === "string" && NEVER_AUTO_FIELDS.has(key);
}

export const AUTOMATION_SOURCE_BY_KEY: ReadonlyMap<AutomationSourceKey, AutomationSourceDef> = new Map(
  AUTOMATION_SOURCES.map((s) => [s.key, s]),
);

export function isKnownFieldKey(key: unknown): key is string {
  return typeof key === "string" && AUTOMATION_FIELD_KEYS.has(key);
}

export function isKnownSourceKey(key: unknown): key is AutomationSourceKey {
  return typeof key === "string" && AUTOMATION_SOURCE_BY_KEY.has(key as AutomationSourceKey);
}

export function isFieldPolicy(value: unknown): value is FieldPolicy {
  return value === "auto" || value === "suggest" || value === "manual";
}

/**
 * 任意の入力を `Record<fieldKey, FieldPolicy>` に正規化する。
 * - 未知のキー / 不正な policy 値 / 配列 / null は捨てる
 * - 既知のキーで policy が省略されている場合はカタログの defaultPolicy にフォールバック
 * - DEFAULT_FIELD_POLICY と一致する項目は除いて永続化を小さく保つ
 */
export function sanitizeFieldPolicies(input: unknown): Record<string, FieldPolicy> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, FieldPolicy> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownFieldKey(k)) continue;
    if (!isFieldPolicy(v)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 任意の入力を `Record<sourceKey, boolean>` に正規化する。
 * - 未知ソース / 真偽値以外は捨てる
 */
export function sanitizeSourcePolicies(input: unknown): Record<AutomationSourceKey, boolean> {
  const out = {} as Record<AutomationSourceKey, boolean>;
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownSourceKey(k)) continue;
    if (typeof v !== "boolean") continue;
    out[k] = v;
  }
  return out;
}
