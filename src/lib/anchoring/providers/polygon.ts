/**
 * Polygon blockchain anchoring provider.
 *
 * Env:
 *   POLYGON_ANCHOR_ENABLED            = "true" | "false" (default: "false")
 *   POLYGON_NETWORK                   = "polygon" | "amoy" (default: "polygon")
 *   POLYGON_RPC_URL                   = RPC endpoint (single-network deployments)
 *   POLYGON_RPC_URL_POLYGON           = Mainnet-specific RPC (wins over POLYGON_RPC_URL when reading mainnet)
 *   POLYGON_RPC_URL_AMOY              = Amoy-specific RPC (wins over POLYGON_RPC_URL when reading Amoy)
 *   POLYGON_PRIVATE_KEY               = Hex-encoded private key for signing txs (WRITE path only)
 *   POLYGON_CONTRACT_ADDRESS          = Deployed LedraAnchor address (single-network deployments)
 *   POLYGON_CONTRACT_ADDRESS_POLYGON  = Mainnet contract (wins over POLYGON_CONTRACT_ADDRESS when reading mainnet)
 *   POLYGON_CONTRACT_ADDRESS_AMOY     = Amoy contract (wins over POLYGON_CONTRACT_ADDRESS when reading Amoy)
 *
 * Cost model:
 *   - Mainnet: ~$0.001/tx, real POL required
 *   - Amoy testnet: free, use https://faucet.polygon.technology/ to get test POL
 *
 * The provider submits the SHA-256 hash (as bytes32) to the LedraAnchor
 * smart contract, which emits an `Anchored` event and stores the hash
 * for on-chain verification.
 *
 * READ / WRITE split:
 *   - Reads (verifyAnchor / findAnchorTx) only need RPC + contract; they accept
 *     a per-call `network` override so rows with `polygon_network = "amoy"` can
 *     still be verified after the runtime cuts over to mainnet.
 *   - Writes (anchorToPolygon) always anchor on the *currently configured*
 *     network and require the signer private key.
 */

import type { PolygonAnchorResult, PolygonNetwork } from "./types";

const DISABLED_RESULT: PolygonAnchorResult = {
  txHash: null,
  anchored: false,
  network: null,
};

const DEFAULT_RPC: Record<PolygonNetwork, string> = {
  polygon: "https://polygon-rpc.com",
  amoy: "https://rpc-amoy.polygon.technology",
};

/** Strict SHA-256 format: 64 hex chars, optional 0x prefix. */
const SHA256_RE = /^(0x)?[0-9a-fA-F]{64}$/;

function isEnabled(): boolean {
  return process.env.POLYGON_ANCHOR_ENABLED === "true";
}

function resolveNetwork(): PolygonNetwork {
  const raw = (process.env.POLYGON_NETWORK ?? "polygon").toLowerCase();
  return raw === "amoy" ? "amoy" : "polygon";
}

/**
 * Look up an env var that may be scoped per network, falling back to the
 * unsuffixed variant. e.g. for base="POLYGON_CONTRACT_ADDRESS" and
 * network="amoy", checks POLYGON_CONTRACT_ADDRESS_AMOY then POLYGON_CONTRACT_ADDRESS.
 */
function perNetworkEnv(base: string, network: PolygonNetwork): string | undefined {
  const suffix = network === "amoy" ? "_AMOY" : "_POLYGON";
  const perNetwork = process.env[`${base}${suffix}`];
  if (perNetwork && perNetwork.length > 0) return perNetwork;
  const fallback = process.env[base];
  return fallback && fallback.length > 0 ? fallback : undefined;
}

/**
 * Validate and normalize a SHA-256 string into a 0x-prefixed bytes32.
 * Returns null for malformed input — callers MUST NOT silently pad/coerce
 * a bad hash (doing so would anchor/verify under the wrong digest).
 */
function toBytes32(sha256: string): `0x${string}` | null {
  if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return null;
  return `0x${sha256.replace(/^0x/, "").toLowerCase()}` as `0x${string}`;
}

/**
 * Read-only config: enough to call view functions / query logs on a given network.
 * Does NOT require POLYGON_PRIVATE_KEY — read paths stay available even if the
 * signer key is missing or rotated.
 */
function getReadConfig(networkOverride?: PolygonNetwork | null) {
  const network = networkOverride ?? resolveNetwork();
  const rpcUrl = perNetworkEnv("POLYGON_RPC_URL", network) ?? DEFAULT_RPC[network];
  const contractAddress = perNetworkEnv("POLYGON_CONTRACT_ADDRESS", network);
  if (!contractAddress) return null;
  return { network, rpcUrl, contractAddress } as const;
}

/**
 * Signer config: read config + private key for write operations.
 * Anchoring always writes to the *currently configured* network; per-call
 * network overrides are not supported for writes.
 */
function getSignerConfig() {
  const read = getReadConfig();
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!read || !privateKey) return null;
  return { ...read, privateKey } as const;
}

/**
 * Anchor a SHA-256 hash to the Polygon blockchain.
 *
 * The hash is submitted to the LedraAnchor smart contract as a bytes32 value.
 * On success, returns the transaction hash for on-chain verification.
 *
 * @param sha256 - The SHA-256 hex string of the image to anchor.
 * @returns PolygonAnchorResult with txHash, anchored status, and network.
 */
export async function anchorToPolygon(sha256: string): Promise<PolygonAnchorResult> {
  if (!isEnabled()) return DISABLED_RESULT;

  const config = getSignerConfig();
  if (!config) {
    console.warn("[polygon] enabled but missing config (POLYGON_PRIVATE_KEY, POLYGON_CONTRACT_ADDRESS)");
    return DISABLED_RESULT;
  }

  const hashBytes32 = toBytes32(sha256);
  if (!hashBytes32) {
    console.warn(`[polygon] rejected malformed SHA-256 (length=${sha256.length}); not anchoring`);
    return DISABLED_RESULT;
  }

  try {
    // Dynamic import to keep viem tree-shaken when polygon is disabled
    const { createPublicClient, createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { polygon, polygonAmoy } = await import("viem/chains");
    const { LEDRA_ANCHOR_ABI } = await import("./polygonContract");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    });

    // Submit the hash to the LedraAnchor contract
    const txHash = await walletClient.writeContract({
      address: config.contractAddress as `0x${string}`,
      abi: LEDRA_ANCHOR_ABI,
      functionName: "anchor",
      args: [hashBytes32],
      chain,
      account,
    });

    // Wait for the transaction to be included in a block
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === "success") {
      console.info(`[polygon:${config.network}] anchored hash=${sha256.slice(0, 12)}… tx=${txHash}`);
      return { txHash, anchored: true, network: config.network };
    }

    console.warn(`[polygon:${config.network}] tx reverted: ${txHash}`);
    return { txHash, anchored: false, network: config.network };
  } catch (error) {
    console.error("[polygon] anchoring failed:", error instanceof Error ? error.message : error);
    return DISABLED_RESULT;
  }
}

/**
 * Verify whether a SHA-256 hash has been anchored on-chain.
 * This is a read-only call (no gas cost, no signer key required).
 *
 * @param sha256   - SHA-256 hex string to verify.
 * @param network  - Optional network override. When set, verification runs on
 *                   that network (using its per-network RPC/contract address
 *                   if configured). Callers verifying an existing DB row should
 *                   pass `row.polygon_network` so a historical Amoy anchor is
 *                   checked against Amoy even after the runtime moved to
 *                   mainnet.
 */
export async function verifyAnchor(
  sha256: string,
  network?: PolygonNetwork | null,
): Promise<boolean> {
  const config = getReadConfig(network);
  if (!config) return false;

  const hashBytes32 = toBytes32(sha256);
  if (!hashBytes32) return false;

  try {
    const { createPublicClient, http } = await import("viem");
    const { polygon, polygonAmoy } = await import("viem/chains");
    const { LEDRA_ANCHOR_ABI } = await import("./polygonContract");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;

    const client = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const isAnchored = await client.readContract({
      address: config.contractAddress as `0x${string}`,
      abi: LEDRA_ANCHOR_ABI,
      functionName: "isAnchored",
      args: [hashBytes32],
      authorizationList: undefined,
    });

    return isAnchored as boolean;
  } catch (error) {
    console.error("[polygon] verification failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Build a Polygonscan explorer URL for a given transaction hash.
 * Returns null if inputs are missing.
 */
export function buildExplorerUrl(txHash: string | null | undefined, network: PolygonNetwork | null | undefined): string | null {
  if (!txHash || !network) return null;
  const base = network === "amoy" ? "https://amoy.polygonscan.com" : "https://polygonscan.com";
  return `${base}/tx/${txHash}`;
}

/**
 * Look up the original transaction hash that anchored this SHA-256.
 *
 * Queries past `Anchored` events on the LedraAnchor contract. Used by the
 * backfill path: when a hash is already on-chain (e.g. because a duplicate
 * upload anchored it first), we can recover the tx hash instead of spending
 * gas on a redundant `anchor()` call.
 *
 * Returns null if config is missing, RPC is unreachable, or the hash
 * was anchored before the RPC's log retention window.
 *
 * @param sha256   - SHA-256 hex string to look up.
 * @param network  - Optional network override (see `verifyAnchor`).
 */
export async function findAnchorTx(
  sha256: string,
  network?: PolygonNetwork | null,
): Promise<{ txHash: `0x${string}`; network: PolygonNetwork } | null> {
  const config = getReadConfig(network);
  if (!config) return null;

  const hashBytes32 = toBytes32(sha256);
  if (!hashBytes32) return null;

  try {
    const { createPublicClient, http, parseAbiItem } = await import("viem");
    const { polygon, polygonAmoy } = await import("viem/chains");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;
    const client = createPublicClient({ chain, transport: http(config.rpcUrl) });

    const logs = await client.getLogs({
      address: config.contractAddress as `0x${string}`,
      event: parseAbiItem("event Anchored(bytes32 indexed hash, address indexed sender, uint256 timestamp)"),
      args: { hash: hashBytes32 },
      fromBlock: "earliest",
      toBlock: "latest",
    });

    if (logs.length === 0) return null;
    // Take the earliest event (first anchor)
    const first = logs.reduce((acc, cur) =>
      BigInt(cur.blockNumber ?? 0) < BigInt(acc.blockNumber ?? 0) ? cur : acc,
    );

    return { txHash: first.transactionHash as `0x${string}`, network: config.network };
  } catch (error) {
    console.warn("[polygon] findAnchorTx failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
