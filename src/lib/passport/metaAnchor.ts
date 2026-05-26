/**
 * Vehicle passport meta-anchor (PR-7).
 *
 * Concept: aggregate every per-image Polygon anchor that contributes to a
 * VIN's passport into one summary hash, and anchor *that* hash on-chain.
 * Net result: a single tx hash that proves "the entire recorded history of
 * this VIN has not been tampered with." External verifiers don't need to
 * walk every image — they recompute the meta hash from public data and
 * compare against the on-chain anchor.
 *
 * Canonical hash format:
 *
 *   sha256(  VIN_normalized
 *          || "\n"
 *          || tx1 || "\n" || tx2 || "\n" || ... || txN
 *         )
 *
 * where tx1..txN are every `certificate_images.polygon_tx_hash` for the
 * VIN's opt-in vehicles, sorted ascending (case-insensitive, with the
 * "0x" prefix preserved as lowercase). Sorting makes the hash independent
 * of cert/image creation order so two parties always agree on the digest.
 *
 * A flat sorted-concat SHA-256 (rather than a true Merkle tree) is enough
 * for "the whole set is intact" — which is the PR-7 success criterion.
 * Per-cert inclusion proofs would require a Merkle tree; we'll layer that
 * on later if/when partners ask for it.
 *
 * Re-anchor policy: `recomputeAndMaybeAnchor` is invoked from
 * `upsertVehiclePassport` after the per-image anchor hook runs. It only
 * submits a new Polygon tx when the recomputed hash differs from what's
 * stored — identical hash → no-op (free).
 *
 * Costs (mainnet): each re-anchor is ~$0.001. With ~1 new cert per
 * vehicle every few months the upper bound is negligible.
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anchorToPolygon } from "@/lib/anchoring/providers";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

export type MetaAnchorInput = {
  vinNormalized: string;
  txHashes: string[];
};

export type MetaAnchorResult = {
  /** sha256 of the canonical digest (no 0x prefix, lowercase hex). */
  metaHash: string;
  /** Distinct txHashes that contributed (sorted, deduped, lowercased). */
  contributingTxHashes: string[];
};

/**
 * Pure: compute the canonical meta hash for a VIN + set of anchored tx hashes.
 *
 * Exported separately from the DB I/O path so tests + external verifiers can
 * call it without touching Supabase.
 */
export function computeMetaAnchorHash(input: MetaAnchorInput): MetaAnchorResult {
  const vin = input.vinNormalized.trim().toUpperCase();
  if (!vin) {
    throw new Error("computeMetaAnchorHash: empty VIN");
  }

  const cleaned = Array.from(
    new Set(input.txHashes.map((t) => t?.trim().toLowerCase()).filter((t): t is string => !!t && t.length > 0)),
  ).sort();

  // Deliberately allow an empty tx set: the meta hash for a VIN with no
  // anchored images is still well-defined (sha256 of VIN + "\n"). We just
  // never bother anchoring a useless empty digest — the caller guards on
  // contributingTxHashes.length before submitting on-chain.

  const payload = [vin, ...cleaned].join("\n");
  const metaHash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return { metaHash, contributingTxHashes: cleaned };
}

/**
 * Read all anchored image tx hashes contributing to this VIN's passport,
 * compute the meta hash, and (if it changed) anchor it to Polygon and
 * persist the resulting tx to `vehicle_passports`.
 *
 * Idempotent: if `meta_anchor_hash` already matches the recomputed hash
 * (which is the common case — most passport upserts don't change the set),
 * this is a no-op and does NOT submit a Polygon tx.
 *
 * Returns the status so the caller can log / surface it; never throws on
 * Polygon failures (we fall back to "hash recorded, tx pending" so the
 * passport row stays consistent and a future re-run can retry the anchor).
 */
export async function recomputeAndMaybeAnchor(
  admin: AdminDb,
  vinNormalized: string,
): Promise<
  | { status: "noop"; reason: "no_anchored_images" | "hash_unchanged"; metaHash: string | null }
  | { status: "anchored"; metaHash: string; txHash: string; network: string; imageCount: number; certCount: number }
  | { status: "anchor_failed"; metaHash: string; reason: string }
> {
  const vin = vinNormalized.trim().toUpperCase();
  if (!vin) return { status: "noop", reason: "no_anchored_images", metaHash: null };

  // 1) Gather every anchored image for opt-in vehicles on this VIN.
  const { data: vehiclesRaw } = await admin
    .from("vehicles")
    .select("id")
    .eq("vin_code_normalized", vin)
    .eq("passport_opt_out", false);
  const vehicleIds = ((vehiclesRaw ?? []) as { id: string }[]).map((v) => v.id);
  if (vehicleIds.length === 0) {
    return { status: "noop", reason: "no_anchored_images", metaHash: null };
  }

  const { data: certsRaw } = await admin.from("certificates").select("id").in("vehicle_id", vehicleIds);
  const certIds = ((certsRaw ?? []) as { id: string }[]).map((c) => c.id);
  if (certIds.length === 0) {
    return { status: "noop", reason: "no_anchored_images", metaHash: null };
  }

  const { data: imgsRaw } = await admin
    .from("certificate_images")
    .select("certificate_id, polygon_tx_hash")
    .in("certificate_id", certIds)
    .not("polygon_tx_hash", "is", null);
  const imgs = (imgsRaw ?? []) as { certificate_id: string; polygon_tx_hash: string }[];
  if (imgs.length === 0) {
    return { status: "noop", reason: "no_anchored_images", metaHash: null };
  }

  // 2) Compute meta hash.
  const { metaHash, contributingTxHashes } = computeMetaAnchorHash({
    vinNormalized: vin,
    txHashes: imgs.map((i) => i.polygon_tx_hash),
  });
  const imageCount = contributingTxHashes.length;
  const certCount = new Set(imgs.map((i) => i.certificate_id)).size;

  // 3) Skip if unchanged.
  const { data: existingRaw } = await admin
    .from("vehicle_passports")
    .select("meta_anchor_hash")
    .eq("vin_code_normalized", vin)
    .maybeSingle();
  const existing = existingRaw as { meta_anchor_hash: string | null } | null;
  if (existing?.meta_anchor_hash === metaHash) {
    return { status: "noop", reason: "hash_unchanged", metaHash };
  }

  // 4) Anchor on-chain (best-effort).
  const anchorResult = await anchorToPolygon(metaHash);
  if (!anchorResult.anchored || !anchorResult.txHash) {
    // Persist the recomputed hash but leave tx fields stale so the cron
    // sweep (or the next upsert that sees the same set) can retry.
    logger.warn("[meta-anchor] polygon anchor failed; hash recorded without tx", {
      vin,
      metaHash: metaHash.slice(0, 12),
    });
    await admin
      .from("vehicle_passports")
      .update({
        meta_anchor_hash: metaHash,
        meta_anchor_image_count: imageCount,
        meta_anchor_cert_count: certCount,
      })
      .eq("vin_code_normalized", vin);
    return { status: "anchor_failed", metaHash, reason: "polygon_disabled_or_error" };
  }

  await admin
    .from("vehicle_passports")
    .update({
      meta_anchor_hash: metaHash,
      meta_anchor_tx_hash: anchorResult.txHash,
      meta_anchor_network: anchorResult.network,
      meta_anchor_anchored_at: new Date().toISOString(),
      meta_anchor_image_count: imageCount,
      meta_anchor_cert_count: certCount,
    })
    .eq("vin_code_normalized", vin);

  return {
    status: "anchored",
    metaHash,
    txHash: anchorResult.txHash,
    network: anchorResult.network ?? "polygon",
    imageCount,
    certCount,
  };
}
