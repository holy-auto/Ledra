/**
 * LedraBatchAnchor (Merkle batch) への書き込み provider。
 *
 * contracts/LedraBatchAnchor.sol の `anchorBatch(bytes32 merkleRoot, uint256 leafCount)`
 * を呼ぶ。画像単体アンカー (providers/polygon.ts) と同じ env / 署名鍵を使うが、
 * コントラクトアドレスだけ別 (POLYGON_BATCH_CONTRACT_ADDRESS)。
 *
 * Env:
 *   POLYGON_ANCHOR_ENABLED              = "true" で有効 (それ以外は no-op)
 *   POLYGON_NETWORK                     = "polygon" | "amoy"
 *   POLYGON_RPC_URL[_POLYGON|_AMOY]     = RPC
 *   POLYGON_PRIVATE_KEY                 = 署名鍵 (anchorer 許可リスト登録済みのこと)
 *   POLYGON_BATCH_CONTRACT_ADDRESS[_POLYGON|_AMOY] = LedraBatchAnchor アドレス
 *
 * 未設定なら DISABLED を返し、呼び出し側 (cron) は queue を据え置く (安全な no-op)。
 */

import type { PolygonNetwork } from "./types";
import { withRetry } from "@/lib/http/withRetry";

export interface BatchAnchorResult {
  txHash: string | null;
  anchored: boolean;
  network: PolygonNetwork | null;
  contractAddress: string | null;
  blockNumber: number | null;
}

const DISABLED_RESULT: BatchAnchorResult = {
  txHash: null,
  anchored: false,
  network: null,
  contractAddress: null,
  blockNumber: null,
};

const LEDRA_BATCH_ANCHOR_ABI = [
  {
    type: "function",
    name: "anchorBatch",
    inputs: [
      { name: "merkleRoot", type: "bytes32", internalType: "bytes32" },
      { name: "leafCount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isAnchored",
    inputs: [{ name: "merkleRoot", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
] as const;

const DEFAULT_RPC: Record<PolygonNetwork, string> = {
  polygon: "https://polygon-rpc.com",
  amoy: "https://rpc-amoy.polygon.technology",
};

/** 0x + 64 hex (bytes32) か。 */
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/;

function isEnabled(): boolean {
  return process.env.POLYGON_ANCHOR_ENABLED === "true";
}

function resolveNetwork(): PolygonNetwork {
  return (process.env.POLYGON_NETWORK ?? "polygon").toLowerCase() === "amoy" ? "amoy" : "polygon";
}

function perNetworkEnv(base: string, network: PolygonNetwork): string | undefined {
  const suffix = network === "amoy" ? "_AMOY" : "_POLYGON";
  const perNetwork = process.env[`${base}${suffix}`];
  if (perNetwork && perNetwork.length > 0) return perNetwork;
  const fallback = process.env[base];
  return fallback && fallback.length > 0 ? fallback : undefined;
}

function getSignerConfig() {
  const network = resolveNetwork();
  const rpcUrl = perNetworkEnv("POLYGON_RPC_URL", network) ?? DEFAULT_RPC[network];
  const contractAddress = perNetworkEnv("POLYGON_BATCH_CONTRACT_ADDRESS", network);
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!contractAddress || !privateKey) return null;
  return { network, rpcUrl, contractAddress, privateKey } as const;
}

/**
 * Merkle root を LedraBatchAnchor へ刻む。
 *
 * 成功で { anchored: true, txHash, blockNumber } を返す。無効化 / 設定不足 / 失敗時は
 * DISABLED_RESULT (anchored=false) を返し、決して throw しない (cron を止めない)。
 */
export async function anchorBatchToPolygon(merkleRoot: string, leafCount: number): Promise<BatchAnchorResult> {
  if (!isEnabled()) return DISABLED_RESULT;

  const config = getSignerConfig();
  if (!config) {
    console.warn("[polygon-batch] enabled but missing config (POLYGON_PRIVATE_KEY, POLYGON_BATCH_CONTRACT_ADDRESS)");
    return DISABLED_RESULT;
  }
  if (!ROOT_RE.test(merkleRoot)) {
    console.warn(`[polygon-batch] rejected malformed merkle root (length=${merkleRoot.length}); not anchoring`);
    return DISABLED_RESULT;
  }

  try {
    const { createPublicClient, createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { polygon, polygonAmoy } = await import("viem/chains");

    const chain = config.network === "amoy" ? polygonAmoy : polygon;
    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
    const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });

    // writeContract は retry しない (nonce 進行 = 別 tx submit のリスク)。
    const txHash = await walletClient.writeContract({
      address: config.contractAddress as `0x${string}`,
      abi: LEDRA_BATCH_ANCHOR_ABI,
      functionName: "anchorBatch",
      args: [merkleRoot as `0x${string}`, BigInt(leafCount)],
      chain,
      account,
    });

    // 既知 tx の receipt poll は idempotent なので retry 安全。
    const receipt = await withRetry("polygon-rpc", () =>
      publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 }),
    );

    if (receipt.status === "success") {
      console.info(`[polygon-batch:${config.network}] anchored root=${merkleRoot.slice(0, 14)}… tx=${txHash}`);
      return {
        txHash,
        anchored: true,
        network: config.network,
        contractAddress: config.contractAddress,
        blockNumber: Number(receipt.blockNumber),
      };
    }

    console.warn(`[polygon-batch:${config.network}] tx reverted: ${txHash}`);
    return DISABLED_RESULT;
  } catch (error) {
    console.error("[polygon-batch] anchoring failed:", error instanceof Error ? error.message : error);
    return DISABLED_RESULT;
  }
}
