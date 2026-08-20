/**
 * IMP-052: E2E テスト環境変数ヘルパー。
 *
 * 認証情報・ロール別クレデンシャルの存在チェックを集約。
 * 未設定時は test.skip でスキップ。
 */

export interface Credentials {
  email: string;
  password: string;
}

/** 管理者 (admin/staff) クレデンシャル */
export function adminCreds(): Credentials | null {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  return email && password ? { email, password } : null;
}

/** 保険会社ポータル クレデンシャル */
export function insurerCreds(): Credentials | null {
  const email = process.env.E2E_INSURER_EMAIL;
  const password = process.env.E2E_INSURER_PASSWORD;
  return email && password ? { email, password } : null;
}

/** 代理店ポータル クレデンシャル */
export function agentCreds(): Credentials | null {
  const email = process.env.E2E_AGENT_EMAIL;
  const password = process.env.E2E_AGENT_PASSWORD;
  return email && password ? { email, password } : null;
}

/** 顧客ポータル テナントスラグ + OTP テスト用電話番号 */
export function customerPortalConfig(): { tenantSlug: string; phone: string } | null {
  const tenantSlug = process.env.E2E_TENANT_SLUG;
  const phone = process.env.E2E_CUSTOMER_PHONE;
  return tenantSlug && phone ? { tenantSlug, phone } : null;
}

/** E2E テストの base URL（デフォルト: http://localhost:3000） */
export function baseUrl(): string {
  return process.env.E2E_BASE_URL || "http://localhost:3000";
}
