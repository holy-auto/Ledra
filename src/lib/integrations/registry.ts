/**
 * 汎用 OAuth エンジンが扱う provider のレジストリ（サーバー専用）。
 *
 * **連携先を 1 つ増やす手順はここに 1 行足すだけ**:
 *   1. `src/lib/integrations/providers/<name>.ts` に OAuthProviderSpec を書く
 *   2. 下の REGISTRY に足す
 *   3. `src/lib/integrations/catalog.ts` に画面表示用の 1 エントリを足す
 *
 * ルート (`/api/admin/connect/[provider]`) も DB も共通なので、
 * マイグレーションも新しい API ルートも書かなくてよい。
 *
 * 注意: このモジュールは Supabase admin client を引きずるので client component
 * から import しないこと（画面表示用の一覧は catalog.ts を使う）。
 */

import { slackProvider } from "./providers/slack";
import type { OAuthProviderSpec } from "./types";

const REGISTRY: Record<string, OAuthProviderSpec> = {
  [slackProvider.id]: slackProvider,
};

export function getOAuthProvider(id: string): OAuthProviderSpec | null {
  return Object.prototype.hasOwnProperty.call(REGISTRY, id) ? REGISTRY[id] : null;
}

export function listOAuthProviders(): OAuthProviderSpec[] {
  return Object.values(REGISTRY);
}

/**
 * env が揃っていて接続を開始できるか。未設定なら加盟店には「運営側の設定待ち」
 * として見せ、ボタンを押させない（押しても Slack 側で失敗するだけなので）。
 */
export function isProviderConfigured(spec: OAuthProviderSpec): boolean {
  return Boolean(process.env[spec.clientIdEnv] && process.env[spec.clientSecretEnv]);
}
