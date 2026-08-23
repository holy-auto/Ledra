/**
 * 代理店プロフィールの「画面上の項目名」と「agents の実列」の対応表。
 *
 * なぜ要るか: 代理店設定の GET/PUT は `company_name / company_address /
 * website_url / logo_url / commission_rate / bank_name / bank_branch /
 * bank_account_type / bank_account_number / bank_account_holder` を読み書き
 * していたが、**agents にこれらの列は無い**（実列は name / address /
 * logo_asset_path / default_commission_rate）。PostgREST はクエリごと失敗
 * するので、代理店の設定画面は表示も保存もできていなかった。
 */
import type { AgentSettingsUpdate } from "@/lib/validations/agent-portal";

/** agents から読む実在の列 */
export const AGENT_PROFILE_COLUMNS = `id, name, contact_name, contact_email, contact_phone, address, logo_asset_path, status, commission_type, default_commission_rate, default_commission_fixed, stripe_account_id, stripe_onboarding_done, notes, created_at, updated_at`;

/** 画面の項目名 → agents の実列 */
const COLUMN_MAP: Partial<Record<keyof AgentSettingsUpdate, string>> = {
  name: "name",
  contact_name: "contact_name",
  contact_email: "contact_email",
  contact_phone: "contact_phone",
  address: "address",
  company_address: "address",
  logo_url: "logo_asset_path",
  commission_type: "commission_type",
  commission_rate: "default_commission_rate",
  notes: "notes",
};

/**
 * 保存先の列が無い項目。**黙って捨てず、呼び出し元に返して拒否する**。
 * 保存できたつもりで消えるのが一番costが高い。
 * ponytail: 上限。銀行口座を代理店ごとに持つなら agents に
 * `bank_info jsonb`（tenants と同じ形）を足すマイグレーションが要る。
 * OPEN_QUESTIONS に起票済み。
 */
const NO_STORAGE: ReadonlyArray<keyof AgentSettingsUpdate> = [
  "company_name",
  "website_url",
  "postal_code",
  "email_notifications",
  "bank_name",
  "bank_branch",
  "bank_account_type",
  "bank_account_number",
  "bank_account_holder",
];

const LABELS: Partial<Record<keyof AgentSettingsUpdate, string>> = {
  company_name: "会社名",
  website_url: "ウェブサイト",
  postal_code: "郵便番号",
  email_notifications: "メール通知",
  bank_name: "銀行名",
  bank_branch: "支店名",
  bank_account_type: "口座種別",
  bank_account_number: "口座番号",
  bank_account_holder: "口座名義",
};

export function toAgentPatch(input: AgentSettingsUpdate): {
  patch: Record<string, unknown>;
  unsupported: string[];
} {
  const patch: Record<string, unknown> = {};
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(input) as [keyof AgentSettingsUpdate, unknown][]) {
    if (value === undefined) continue;
    if (NO_STORAGE.includes(key)) {
      // 画面は未入力の項目も毎回送ってくる。空のまま送られたものは
      // 失うものが無いので黙って落として構わない。**中身がある時だけ**
      // 保存できないと返す（そうしないと保存操作そのものが通らなくなる）
      if (value === "" || value === null) continue;
      unsupported.push(LABELS[key] ?? key);
      continue;
    }
    const column = COLUMN_MAP[key];
    if (column) patch[column] = value;
  }
  return { patch, unsupported };
}
