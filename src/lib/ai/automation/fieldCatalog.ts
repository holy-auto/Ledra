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
export type AutomationWorkflowKey = "certificate" | "vehicle" | "customer_intake" | "job";

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
    defaultPolicy: "suggest",
    sources: ["identity_documents"],
  },
  {
    key: "vehicle.fuel_type",
    workflow: "vehicle",
    label: "燃料種別",
    defaultPolicy: "suggest",
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
    defaultPolicy: "suggest",
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
];

export const AUTOMATION_FIELD_BY_KEY: ReadonlyMap<string, AutomationFieldDef> = new Map(
  AUTOMATION_FIELDS.map((f) => [f.key, f]),
);

export const AUTOMATION_FIELD_KEYS: ReadonlySet<string> = new Set(AUTOMATION_FIELDS.map((f) => f.key));

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
