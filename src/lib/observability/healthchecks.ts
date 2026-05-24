/**
 * Healthchecks.io への heartbeat ping。
 *
 * G15: monitor cron 死活監視の二重盲点を、Healthchecks.io Free 枠で解消する。
 * `/api/cron/monitor` が成功するたびに対応する ping URL を叩き、Healthchecks 側で
 * 「最後の ping から N 時間以上経過したら通知」を発火する。
 *
 * 設定方法 (docs/internal/operations-runbook.md §1.1 参照):
 *   1. Healthchecks.io に登録 (Free 枠で 20 checks まで)
 *   2. "monitor" check を作成し、Schedule = 24h (Grace = 2h) 等で設定
 *   3. 発行された Ping URL を Vercel env var `HEALTHCHECKS_MONITOR_PING_URL` に設定
 *   4. Healthchecks 側で Email / Slack 通知先を登録
 *
 * 設計:
 * - env 未設定なら no-op (dev / preview 環境で安全)
 * - fetch 失敗は握りつぶし (ping 失敗で cron 全体が落ちるのを防ぐ)
 * - 短い timeout (5s) で cron を遅延させない
 *
 * 関連 SaaS 構成:
 *   - Healthchecks.io (cron heartbeat): https://healthchecks.io
 *   - UptimeRobot (HTTP probe / Vercel 全断検出): /api/health を 5 分間隔で probe
 */

const PING_TIMEOUT_MS = 5_000;

/**
 * Healthchecks.io の ping URL を叩く。
 *
 * @param pingUrl 対応する check の Ping URL (例: "https://hc-ping.com/<uuid>")
 * @param status 任意: "fail" または "log" を末尾に append すると専用 ping (default: success)
 */
export async function sendHeartbeat(pingUrl: string | undefined, status?: "fail" | "log"): Promise<void> {
  if (!pingUrl) return;
  const url = status ? `${pingUrl}/${status}` : pingUrl;
  try {
    await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch {
    // ping 失敗は cron を止めない (Healthchecks 側の grace で次の ping を待つ)
  }
}
