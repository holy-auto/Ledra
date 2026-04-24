/**
 * Polygon 署名ウォレット残高監視 cron
 *
 * GET /api/cron/polygon-signer   (毎時)
 *
 * 用途:
 *   - Ledra が施工画像ハッシュをアンカーするために使っている POL 残高が
 *     底をつく前に、運用チームへメール通知する
 *   - 残高が閾値を下回ったときだけアラートメールを送る
 *   - 健全時はメール送信せず、JSON サマリだけを返す
 *
 * 設計上の注意:
 *   - POLYGON_ANCHOR_ENABLED が "true" のときしかアラートは有効。
 *     dev / testnet 運用時のスパム回避のため。
 *   - RPC 障害や設定不足は status=skipped として 200 で返す (cron 側を失敗に
 *     しない)。メール通知は送らない。
 *   - 残高は wei (18 decimals) で取得し、POL 単位に変換して閾値比較する。
 *
 * 閾値 (どちらも POL 単位、小数 OK):
 *   - POLYGON_WALLET_ALERT_BALANCE_POL (default 0.1) — これ未満で "critical"
 *   - POLYGON_WALLET_WARN_BALANCE_POL  (default 0.5) — これ未満で "warning"
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiJson, apiUnauthorized } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API = "https://api.resend.com/emails";

const DEFAULT_RPC: Record<"polygon" | "amoy", string> = {
  polygon: "https://polygon-rpc.com",
  amoy: "https://rpc-amoy.polygon.technology",
};

type SignerStatus = "healthy" | "warning" | "critical" | "skipped" | "error";

type SignerSummary = {
  timestamp: string;
  status: SignerStatus;
  network: "polygon" | "amoy" | null;
  address: string | null;
  balance_pol: string | null;
  balance_wei: string | null;
  thresholds: {
    warn_pol: number;
    alert_pol: number;
  };
  message: string;
};

function resolveNetwork(): "polygon" | "amoy" {
  const raw = (process.env.POLYGON_NETWORK ?? "polygon").toLowerCase();
  return raw === "amoy" ? "amoy" : "polygon";
}

function getConfig() {
  const network = resolveNetwork();
  const rpcUrl = process.env.POLYGON_RPC_URL || DEFAULT_RPC[network];
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!privateKey) return null;
  return { network, rpcUrl, privateKey } as const;
}

function parsePolThreshold(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 18 decimals の wei を POL 単位の小数文字列に変換 (精度維持のため BigInt 手計算) */
function weiToPolString(wei: bigint): string {
  const DECIMALS = BigInt(18);
  const base = BigInt(10) ** DECIMALS;
  const whole = wei / base;
  const frac = wei % base;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}

/** wei を小数 POL の number に変換 (閾値比較用。精度損失 OK) */
function weiToPolNumber(wei: bigint): number {
  return Number(wei) / 1e18;
}

async function sendAlertEmail(summary: SignerSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) {
    console.warn("[cron/polygon-signer] would alert but RESEND_API_KEY / CONTACT_TO_EMAIL not configured");
    return;
  }

  const from = process.env.RESEND_FROM ?? "noreply@ledra.co.jp";
  const subject =
    summary.status === "critical"
      ? `[Ledra CRITICAL] Polygon signer wallet running out (${summary.balance_pol} POL)`
      : `[Ledra WARN] Polygon signer wallet low (${summary.balance_pol} POL)`;

  const body = [
    `Polygon signer wallet balance is ${summary.status.toUpperCase()}.`,
    "",
    `Network: ${summary.network}`,
    `Address: ${summary.address}`,
    `Balance: ${summary.balance_pol} POL (${summary.balance_wei} wei)`,
    `Warn threshold:     ${summary.thresholds.warn_pol} POL`,
    `Critical threshold: ${summary.thresholds.alert_pol} POL`,
    "",
    "Top up via a Polygon-compatible wallet (MetaMask / Rabby / hardware).",
    "Once POL is exhausted, new certificate images will still be uploaded",
    "but will NOT be anchored on-chain; existing anchors remain verifiable.",
  ].join("\n");

  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
  } catch (e) {
    console.error("[cron/polygon-signer] failed to send alert email:", e);
  }
}

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  const now = new Date();
  const warnPol = parsePolThreshold(process.env.POLYGON_WALLET_WARN_BALANCE_POL, 0.5);
  const alertPol = parsePolThreshold(process.env.POLYGON_WALLET_ALERT_BALANCE_POL, 0.1);

  // アンカー自体が無効なときは skip (dev / testnet 無効環境でのスパム防止)
  if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
    const summary: SignerSummary = {
      timestamp: now.toISOString(),
      status: "skipped",
      network: null,
      address: null,
      balance_pol: null,
      balance_wei: null,
      thresholds: { warn_pol: warnPol, alert_pol: alertPol },
      message: "POLYGON_ANCHOR_ENABLED is not 'true'; skipping balance check.",
    };
    return apiJson(summary);
  }

  const config = getConfig();
  if (!config) {
    const summary: SignerSummary = {
      timestamp: now.toISOString(),
      status: "skipped",
      network: null,
      address: null,
      balance_pol: null,
      balance_wei: null,
      thresholds: { warn_pol: warnPol, alert_pol: alertPol },
      message: "POLYGON_PRIVATE_KEY not set; cannot derive signer address.",
    };
    console.warn("[cron/polygon-signer] skipped: missing POLYGON_PRIVATE_KEY");
    return apiJson(summary);
  }

  try {
    // 動的 import で cold-start を軽く保つ
    const { createPublicClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { polygon, polygonAmoy } = await import("viem/chains");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    const client = createPublicClient({ chain, transport: http(config.rpcUrl) });

    const balanceWei = await client.getBalance({ address: account.address });
    const balancePol = weiToPolNumber(balanceWei);

    let status: SignerStatus = "healthy";
    let message = `Balance OK: ${weiToPolString(balanceWei)} POL`;
    if (balancePol < alertPol) {
      status = "critical";
      message = `Balance critically low: ${weiToPolString(balanceWei)} POL (< ${alertPol})`;
    } else if (balancePol < warnPol) {
      status = "warning";
      message = `Balance below warning threshold: ${weiToPolString(balanceWei)} POL (< ${warnPol})`;
    }

    const summary: SignerSummary = {
      timestamp: now.toISOString(),
      status,
      network: config.network,
      address: account.address,
      balance_pol: weiToPolString(balanceWei),
      balance_wei: balanceWei.toString(),
      thresholds: { warn_pol: warnPol, alert_pol: alertPol },
      message,
    };

    if (status === "critical" || status === "warning") {
      await sendAlertEmail(summary);
    }

    console.info(`[cron/polygon-signer] ${status} network=${config.network} balance=${summary.balance_pol} POL`);
    return apiJson(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/polygon-signer] balance check failed:", msg);
    const summary: SignerSummary = {
      timestamp: now.toISOString(),
      status: "error",
      network: config.network,
      address: null,
      balance_pol: null,
      balance_wei: null,
      thresholds: { warn_pol: warnPol, alert_pol: alertPol },
      message: `RPC error: ${msg}`,
    };
    return apiJson(summary, { status: 200 });
  }
}
