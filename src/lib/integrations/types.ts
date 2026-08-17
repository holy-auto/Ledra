/**
 * 汎用 OAuth 連携の型定義。
 *
 * ねらい: Authorization Code 型の OAuth2 で繋がる連携先なら、
 * provider 定義 (OAuthProviderSpec) を 1 ファイル書くだけで
 *
 *   - 認可 URL の組み立て
 *   - state の署名・検証
 *   - code → token 交換
 *   - tenant_integrations への保存 / 解除
 *   - 「◯◯でログイン」ボタンの API
 *
 * が全部生えるようにする。provider 固有の処理は `onConnected` /
 * `onDisconnect` だけに閉じ込める。
 */

export type IntegrationStatus = "pending" | "active" | "disconnected" | "error";

/** token エンドポイントの生レスポンス (provider ごとに追加フィールドがある) */
export type OAuthTokenResponse = Record<string, unknown> & {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

/** 連携完了時に tenant_integrations へ保存する付随情報 */
export interface ProviderConnectionInfo {
  /** 接続先アカウントの ID (Slack: team.id 等) */
  externalAccountId?: string | null;
  /** 加盟店の画面に出す接続先名 (Slack: ワークスペース名) */
  externalAccountName?: string | null;
  /** 非機密の表示用情報のみ。秘密情報は絶対に入れない (RLS 上メンバー全員が読める) */
  metadata?: Record<string, unknown>;
}

export interface OAuthProviderSpec {
  /** レジストリ ID = URL の {provider} = DB の provider 列 */
  readonly id: string;
  /** 画面表示名 */
  readonly label: string;
  /** 1 行説明 (連携ページのカードに出す) */
  readonly summary: string;

  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];

  /** client_id / client_secret を読む env 名。未設定なら 503 + 案内を返す */
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;

  /** authorize に足す固定クエリ (例: access_type=offline) */
  readonly extraAuthParams?: Readonly<Record<string, string>>;

  /**
   * アクセストークン / リフレッシュトークンを tenant_integrations に保存するか。
   * Slack のように「incoming webhook URL だけ使い、bot token は使わない」場合は
   * false にして、保持する秘密情報を最小化する。
   */
  readonly storeTokens: boolean;

  /** 連携完了後に戻す画面 */
  readonly returnPath: string;

  /**
   * token 交換直後に走る provider 固有処理。
   *
   * - レスポンスの妥当性検証 (Slack のように HTTP 200 + `ok:false` を返す API はここで throw)
   * - provider 固有の保存 (例: Slack の incoming webhook URL を tenants 列へ)
   * - 画面表示用メタデータの抽出
   *
   * throw した場合は連携失敗として扱い、tenant_integrations には active を書かない。
   */
  onConnected?(ctx: { tenantId: string; token: OAuthTokenResponse }): Promise<ProviderConnectionInfo>;

  /** 連携解除時の後始末 (provider 固有の保存先を消す) */
  onDisconnect?(ctx: { tenantId: string }): Promise<void>;
}
