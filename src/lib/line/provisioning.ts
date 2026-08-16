/**
 * LINE 連携の自動セットアップ。
 *
 * 加盟店に LINE Developers Console でやってもらっていた作業のうち、
 * Messaging API で代行できるものを Ledra 側が全部やる。
 *
 *   これまで (7手順)                          → これから (2値を貼るだけ)
 *   1. 公式アカウント開設                        1. 公式アカウント開設
 *   2. Messaging API チャネル作成                2. Messaging API チャネル作成
 *   3. Channel ID / Secret をコピー              3. Channel ID / Secret を貼る
 *   4. 長期アクセストークンを発行してコピー       → Ledra が自動発行
 *   5. 3つの値を貼る                             → 2つに減る
 *   6. Webhook URL をコピーして Console に貼る    → Ledra が自動設定
 *   7. 応答メッセージを OFF                      → Ledra が状態を検出して案内
 *
 * 出典 (LINE 公式 OpenAPI 定義 github.com/line/line-openapi):
 *   - POST /v2/oauth/accessToken               (channel-access-token.yml)
 *   - GET  /v2/bot/info                        (messaging-api.yml)
 *   - PUT  /v2/bot/channel/webhook/endpoint    (messaging-api.yml)
 *   - GET  /v2/bot/channel/webhook/endpoint    (messaging-api.yml)
 *   - POST /v2/bot/channel/webhook/test        (messaging-api.yml)
 *
 * ponytail: Webhook の「利用する」トグル自体を切り替える API は公開されていない
 * （PUT できるのは URL だけで、GET が返す `active` は読み取り専用）。そのため
 * OFF のときは検出して 1 行の案内を出す。上限: ここだけ手作業が残る。
 * モジュールチャネル（要申請）が使えるようになれば、この工程ごと不要になる。
 */

const LINE_API = "https://api.line.me";
const TIMEOUT_MS = 10_000;

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = "LineApiError";
  }
}

async function lineFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${LINE_API}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export interface IssuedToken {
  accessToken: string;
  /** 失効時刻 (ISO8601)。client_credentials 版は 30 日。null は手入力の長期トークン（無期限）。 */
  expiresAt: string | null;
}

/**
 * Channel ID + Channel Secret からチャネルアクセストークンを発行する。
 * 加盟店が Console で長期トークンを発行する工程がこれで不要になる。
 */
export async function issueChannelAccessToken(channelId: string, channelSecret: string): Promise<IssuedToken> {
  const res = await lineFetch("/v2/oauth/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LineApiError(
      res.status,
      "/v2/oauth/accessToken",
      res.status === 400 || res.status === 401
        ? "Channel ID または Channel Secret が正しくありません。LINE Developers Console の「チャネル基本設定」の値をそのまま貼り付けてください。"
        : `LINE のトークン発行に失敗しました (HTTP ${res.status})`,
    );
  }

  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new LineApiError(res.status, "/v2/oauth/accessToken", "LINE からトークンが返りませんでした。");
  }
  // expires_in が無い/壊れている場合も期限切れ扱いにせず 30 日として扱う（LINE の既定値）。
  const expiresInSec = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 30 * 24 * 3600;
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
}

/**
 * 期限切れが近いと判断する余裕。Ledra が自動発行するトークンは 30 日有効なので、
 * 3 日前から差し替える（送信が数日途切れても失効前に一度は通る幅）。
 */
const TOKEN_REFRESH_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

/** 保存済みトークンを再発行すべきか。NULL は手入力の長期トークン＝無期限なので対象外。 */
export function isLineTokenExpiringSoon(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  // パースできない値で毎回再発行を走らせない（LINE を無駄に叩かない）。
  if (Number.isNaN(t)) return false;
  return t - now.getTime() < TOKEN_REFRESH_MARGIN_MS;
}

export interface BotInfo {
  basicId: string | null;
  displayName: string | null;
  /** "chat" = 応答モードがチャット（人が返信） / "bot" = Bot（Ledra の自動応答が効く） */
  chatMode: "chat" | "bot" | null;
}

export async function getBotInfo(accessToken: string): Promise<BotInfo> {
  const res = await lineFetch("/v2/bot/info", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new LineApiError(
      res.status,
      "/v2/bot/info",
      res.status === 401
        ? "発行したトークンが LINE に拒否されました。Channel Secret を再確認してください。"
        : `LINE への接続確認に失敗しました (HTTP ${res.status})`,
    );
  }
  const body = (await res.json().catch(() => null)) as {
    basicId?: string;
    displayName?: string;
    chatMode?: string;
  } | null;
  return {
    basicId: body?.basicId ?? null,
    displayName: body?.displayName ?? null,
    chatMode: body?.chatMode === "chat" || body?.chatMode === "bot" ? body.chatMode : null,
  };
}

/** Webhook URL を LINE 側に設定する（加盟店が Console に貼り戻す工程を消す）。 */
export async function setWebhookEndpoint(accessToken: string, endpoint: string): Promise<void> {
  const res = await lineFetch("/v2/bot/channel/webhook/endpoint", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) {
    throw new LineApiError(
      res.status,
      "/v2/bot/channel/webhook/endpoint",
      `Webhook URL の自動設定に失敗しました (HTTP ${res.status})`,
    );
  }
}

export interface WebhookStatus {
  endpoint: string | null;
  /** LINE 側の「Webhookの利用」トグル。API では設定できないので読み取りのみ。 */
  active: boolean;
}

export async function getWebhookEndpoint(accessToken: string): Promise<WebhookStatus> {
  const res = await lineFetch("/v2/bot/channel/webhook/endpoint", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 未設定なら 404 が返る。エラーではなく「未設定」として扱う。
  if (res.status === 404) return { endpoint: null, active: false };
  if (!res.ok) {
    throw new LineApiError(
      res.status,
      "/v2/bot/channel/webhook/endpoint",
      `Webhook 設定の取得に失敗しました (HTTP ${res.status})`,
    );
  }
  const body = (await res.json().catch(() => null)) as { endpoint?: string; active?: boolean } | null;
  return { endpoint: body?.endpoint ?? null, active: !!body?.active };
}

export interface WebhookTestResult {
  success: boolean;
  statusCode: number | null;
  detail: string | null;
}

/**
 * LINE から Webhook URL へ実際に配送できるかを試す。
 * 「保存はできたのにメッセージが届かない」を保存時点で検出するために使う。
 */
export async function testWebhookEndpoint(accessToken: string, endpoint?: string): Promise<WebhookTestResult> {
  const res = await lineFetch("/v2/bot/channel/webhook/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    statusCode?: number;
    detail?: string;
    reason?: string;
  } | null;
  if (!res.ok) {
    return { success: false, statusCode: res.status, detail: body?.detail ?? body?.reason ?? null };
  }
  return {
    success: !!body?.success,
    statusCode: typeof body?.statusCode === "number" ? body.statusCode : null,
    detail: body?.detail ?? body?.reason ?? null,
  };
}

export interface ProvisionResult {
  token: IssuedToken;
  bot: BotInfo;
  webhook: WebhookStatus;
  test: WebhookTestResult;
  /** 加盟店にまだ手でやってもらう必要がある項目（空なら完全自動で完了） */
  manualSteps: string[];
}

/**
 * Channel ID + Channel Secret だけを受け取り、繋がる状態まで一気に持っていく。
 *
 * トークン発行 → 疎通確認 → Webhook URL 設定 → 配送テスト、を1回で行い、
 * 残った手作業だけを `manualSteps` に列挙して画面へ返す。
 */
export async function provisionLineChannel(params: {
  channelId: string;
  channelSecret: string;
  webhookUrl: string;
}): Promise<ProvisionResult> {
  const token = await issueChannelAccessToken(params.channelId, params.channelSecret);
  return setUpWithToken(token, params.webhookUrl);
}

/**
 * 既に手で発行した長期トークンを持っている加盟店向けの経路。
 * トークンは発行し直さない（無期限なので expiresAt は null）が、
 * Webhook の自動設定と配送テストは同じように行う。
 */
export async function verifyWithExistingToken(accessToken: string, webhookUrl: string): Promise<ProvisionResult> {
  return setUpWithToken({ accessToken, expiresAt: null }, webhookUrl);
}

async function setUpWithToken(token: IssuedToken, webhookUrl: string): Promise<ProvisionResult> {
  const bot = await getBotInfo(token.accessToken);

  await setWebhookEndpoint(token.accessToken, webhookUrl);
  const webhook = await getWebhookEndpoint(token.accessToken);
  const test = await testWebhookEndpoint(token.accessToken, webhookUrl);

  const manualSteps: string[] = [];
  if (!webhook.active) {
    manualSteps.push(
      "LINE Developers Console の「Messaging API設定」で「Webhookの利用」をONにしてください（URLはLedraが設定済みです）。",
    );
  }
  if (bot.chatMode === "chat") {
    manualSteps.push(
      "LINE公式アカウント管理画面の「応答設定」で応答モードを「Bot」にしてください（チャットのままだとLedraの自動応答が返りません）。",
    );
  }
  if (!test.success && webhook.active) {
    manualSteps.push(
      `LINEからWebhookへの配送テストが失敗しました${test.statusCode ? `（HTTP ${test.statusCode}）` : ""}。時間をおいて「接続を再確認」を押してください。`,
    );
  }

  return { token, bot, webhook, test, manualSteps };
}
