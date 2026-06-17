/**
 * 証明書レコードアンカリング — Merkle batch 処理 (cron 本体・全テナント横断)。
 *
 * 設計: docs/anchoring-roadmap.md
 *
 * certificate_anchors の queued 行を集め、cert_digest から Merkle tree を構築し、
 * LedraBatchAnchor へ root 1件を刻む。確定後、各行に proof / batch_id / status='anchored'
 * を書き戻し、certificates.latest_anchor_id を最新 anchor に更新する。
 *
 * アンカー無効 (POLYGON_ANCHOR_ENABLED=false / 設定不足) のときは行を queued のまま
 * 据え置く安全な no-op。root はコントラクト側で idempotent なので再実行も安全。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { buildCertMerkle } from "./certificateMerkle";
import { anchorBatchToPolygon } from "./providers/polygonBatch";
import { logger } from "@/lib/logger";

export interface BatchRunResult {
  scanned: number;
  /** 'anchored' に遷移した anchor 行数。 */
  anchored: number;
  /** root をオンチェーンに刻めたか。 */
  batched: boolean;
  reason?: "empty" | "anchor_skipped_or_failed" | "batch_insert_failed";
  merkleRoot?: string;
  txHash?: string;
}

interface QueuedAnchorRow {
  id: string;
  tenant_id: string;
  certificate_id: string;
  cert_digest: string;
}

/**
 * queued の証明書 anchor をまとめて 1 つの Merkle batch として刻む。
 *
 * @param limit 1 回で処理する最大 anchor 行数 (既定 5000 / 超過は次回繰越)。
 */
export async function runCertificateAnchorBatch(limit = 5000): Promise<BatchRunResult> {
  const admin = createServiceRoleAdmin("cron — certificate record Merkle batch anchoring (all tenants)");

  const { data, error } = await admin
    .from("certificate_anchors")
    .select("id, tenant_id, certificate_id, cert_digest")
    .eq("status", "queued")
    .eq("anchor_route", "batch")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`queued anchors load failed: ${error.message}`);

  const rows = (data ?? []) as QueuedAnchorRow[];
  const scanned = rows.length;
  if (scanned === 0) return { scanned: 0, anchored: 0, batched: false, reason: "empty" };

  const { root, leafCount, proofByDigest } = buildCertMerkle(rows.map((r) => r.cert_digest));

  const res = await anchorBatchToPolygon(root, leafCount);
  if (!res.anchored || !res.txHash) {
    // 無効 / 設定不足 / 失敗 → 行は queued のまま (次回 cron で再試行)。
    return { scanned, anchored: 0, batched: false, reason: "anchor_skipped_or_failed", merkleRoot: root };
  }

  const now = new Date().toISOString();
  const { data: batch, error: batchErr } = await admin
    .from("certificate_anchor_batches")
    .insert({
      merkle_root: root,
      leaf_count: leafCount,
      contract_address: res.contractAddress,
      network: res.network,
      tx_hash: res.txHash,
      block_number: res.blockNumber,
      anchored_at: now,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    // root は既にオンチェーン (idempotent)。行は queued のまま残し次回再処理させる。
    logger.warn("[cert-batch-anchor] batch row insert failed", { err: batchErr?.message, root });
    return {
      scanned,
      anchored: 0,
      batched: false,
      reason: "batch_insert_failed",
      merkleRoot: root,
      txHash: res.txHash,
    };
  }
  const batchId = (batch as { id: string }).id;

  let anchored = 0;
  for (const r of rows) {
    const proof = proofByDigest.get(r.cert_digest.toLowerCase()) ?? [];
    const { error: upErr } = await admin
      .from("certificate_anchors")
      .update({
        status: "anchored",
        batch_id: batchId,
        merkle_proof: proof,
        polygon_network: res.network,
        anchored_at: now,
      })
      .eq("id", r.id)
      .eq("status", "queued"); // 並行 cron での二重処理を避ける
    if (upErr) {
      logger.warn("[cert-batch-anchor] anchor row update failed", { id: r.id, err: upErr.message });
      continue;
    }
    // この証明書の「最新 anchor」を指す (created_at 昇順なので最後に処理した行が最新)。
    const { error: certErr } = await admin
      .from("certificates")
      .update({ latest_anchor_id: r.id })
      .eq("id", r.certificate_id)
      .eq("tenant_id", r.tenant_id);
    if (certErr) {
      logger.warn("[cert-batch-anchor] latest_anchor_id update failed", { id: r.certificate_id, err: certErr.message });
    }
    anchored++;
  }

  return { scanned, anchored, batched: true, merkleRoot: root, txHash: res.txHash };
}
