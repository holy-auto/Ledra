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
export const AGENT_PROFILE_COLUMNS = `id, name, contact_name, contact_email, contact_phone, postal_code, address, website_url, logo_asset_path, status, commission_type, default_commission_rate, default_commission_fixed, bank_info, stripe_account_id, stripe_onboarding_done, notes, created_at, updated_at`;

/** 振込先の形。tenants.bank_info と揃える */
export interface AgentBankInfo {
  bank_name?: string;
  branch?: string;
  account_type?: string;
  account_number?: string;
  account_holder?: string;
}

/** 画面の項目名 → bank_info の中のキー */
const BANK_MAP: Partial<Record<keyof AgentSettingsUpdate, keyof AgentBankInfo>> = {
  bank_name: "bank_name",
  bank_branch: "branch",
  bank_account_type: "account_type",
  bank_account_number: "account_number",
  bank_account_holder: "account_holder",
};

/** 画面の項目名 → agents の実列 */
const COLUMN_MAP: Partial<Record<keyof AgentSettingsUpdate, string>> = {
  name: "name",
  contact_name: "contact_name",
  contact_email: "contact_email",
  contact_phone: "contact_phone",
  address: "address",
  company_address: "address",
  postal_code: "postal_code",
  website_url: "website_url",
  logo_url: "logo_asset_path",
  commission_type: "commission_type",
  commission_rate: "default_commission_rate",
  notes: "notes",
};

/**
 * まだ保存先の無い項目。**黙って捨てず、呼び出し元に返して拒否する**。
 * 保存できたつもりで消えるのが一番costが高い。
 *
 * - `company_name`: agents は `name` 一本。別に会社名を持つ必要が出たら列を足す
 * - `email_notifications`: 通知の設定は代理店単位ではなく利用者単位で持つべきで、
 *   置き場所（agent_users か別テーブル）が決まっていない
 */
const NO_STORAGE: ReadonlyArray<keyof AgentSettingsUpdate> = ["company_name", "email_notifications"];

const LABELS: Partial<Record<keyof AgentSettingsUpdate, string>> = {
  company_name: "会社名",
  email_notifications: "メール通知",
};

/**
 * 画面から来た値を agents の更新内容に変換する。
 * 振込先は `bank_info`（jsonb）にまとめるため、**既存の中身に重ねる**
 * （1項目だけ更新したときに他の項目が消えないように）。
 */
export function toAgentPatch(
  input: AgentSettingsUpdate,
  currentBankInfo?: AgentBankInfo | null,
): { patch: Record<string, unknown>; unsupported: string[] } {
  const patch: Record<string, unknown> = {};
  const unsupported: string[] = [];
  const bank: AgentBankInfo = { ...(currentBankInfo ?? {}) };
  let bankTouched = false;

  for (const [key, value] of Object.entries(input) as [keyof AgentSettingsUpdate, unknown][]) {
    if (value === undefined) continue;
    if (NO_STORAGE.includes(key)) {
      // 画面は未入力の項目も毎回送ってくる。空のまま送られたものは
      // 失うものが無いので黙って落として構わない。**中身がある時だけ**
      // 保存できないと返す（そうしないと保存操作そのものが通らなくなる）
      if (value === "" || value === null || value === false) continue;
      unsupported.push(LABELS[key] ?? key);
      continue;
    }
    const bankKey = BANK_MAP[key];
    if (bankKey) {
      bankTouched = true;
      if (value === "" || value === null) delete bank[bankKey];
      else bank[bankKey] = value as string;
      continue;
    }
    const column = COLUMN_MAP[key];
    if (column) patch[column] = value;
  }

  if (bankTouched) patch.bank_info = Object.keys(bank).length > 0 ? bank : null;
  return { patch, unsupported };
}
