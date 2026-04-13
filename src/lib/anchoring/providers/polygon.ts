/**
 * Polygon blockchain anchoring provider.
 *
 * Env:
 *   POLYGON_ANCHOR_ENABLED    = "true" | "false" (default: "false")
 *   POLYGON_NETWORK           = "polygon" | "amoy" (default: "polygon")
 *   POLYGON_RPC_URL           = RPC endpoint override (optional; defaults per network)
 *   POLYGON_PRIVATE_KEY       = Hex-encoded private key for signing txs
 *   POLYGON_CONTRACT_ADDRESS  = Address of the deployed LedraAnchor contract
 *
 * Cost model:
 *   - Mainnet: ~$0.001/tx, real POL required
 *   - Amoy testnet: free, use https://faucet.polygon.technology/ to get test POL
 *
 * The provider submits the SHA-256 hash (as bytes32) to the LedraAnchor
 * smart contract, which emits an `Anchored` event and stores the hash
 * for on-chain verification.
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

function isEnabled(): boolean {
  return process.env.POLYGON_ANCHOR_ENABLED === "true";
}

function resolveNetwork(): PolygonNetwork {
  const raw = (process.env.POLYGON_NETWORK ?? "polygon").toLowerCase();
  return raw === "amoy" ? "amoy" : "polygon";
}

function getConfig() {
  const network = resolveNetwork();
  const rpcUrl = process.env.POLYGON_RPC_URL || DEFAULT_RPC[network];
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  const contractAddress = process.env.POLYGON_CONTRACT_ADDRESS;

  if (!privateKey || !contractAddress) {
    return null;
  }

  return { network, rpcUrl, privateKey, contractAddress } as const;
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

  const config = getConfig();
  if (!config) {
    console.warn("[polygon] enabled but missing config (POLYGON_PRIVATE_KEY, POLYGON_CONTRACT_ADDRESS)");
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

    // Normalize SHA-256 to bytes32 (ensure 0x prefix, 64 hex chars)
    const hashBytes32 = `0x${sha256.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;

    // Submit the hash to the LedraAnchor contract
    const txHash = await walletClient.writeContract({
      address: config.contractAddress as `0x${string}`,
      abi: LEDRA_ANCHOR_ABI,
      functionName: "anchor",
      args: [hashBytes32],
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
 * This is a read-only call (no gas cost).
 */
export async function verifyAnchor(sha256: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    const { createPublicClient, http } = await import("viem");
    const { polygon, polygonAmoy } = await import("viem/chains");
    const { LEDRA_ANCHOR_ABI } = await import("./polygonContract");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;

    const client = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const hashBytes32 = `0x${sha256.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;

    const isAnchored = await client.readContract({
      address: config.contractAddress as `0x${string}`,
      abi: LEDRA_ANCHOR_ABI,
      functionName: "isAnchored",
      args: [hashBytes32],
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
 */
export async function findAnchorTx(
  sha256: string,
): Promise<{ txHash: `0x${string}`; network: PolygonNetwork } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const { createPublicClient, http, parseAbiItem } = await import("viem");
    const { polygon, polygonAmoy } = await import("viem/chains");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;
    const client = createPublicClient({ chain, transport: http(config.rpcUrl) });

    const hashBytes32 = `0x${sha256.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;

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
      BigInt(cur.blockNumber ?? 0n) < BigInt(acc.blockNumber ?? 0n) ? cur : acc,
    );

    return { txHash: first.transactionHash as `0x${string}`, network: config.network };
  } catch (error) {
    console.warn("[polygon] findAnchorTx failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
