/**
 * 部品装着のブロックチェーンアンカー（§6.5：high_value/serialized は個別アンカー）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.5
 *
 * 完全凍結された part_installations 行は更新できないため、アンカー結果は
 * 追記テーブル part_installation_anchors に記録する。TSA（一次手段）に加えた
 * 独立した第三者検証。POLYGON_ANCHOR_ENABLED=false なら no-op。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";
import { computePartsMetaHash } from "@/lib/parts/metaAnchor";

export type PartKind = "serialized" | "lot_only" | "consumable" | "high_value";

/** 個別アンカー対象か（高額・シリアル品）。純関数。 */
export function shouldAnchorKind(kind: PartKind): boolean {
  return kind === "high_value" || kind === "serialized";
}

export interface AnchorRunResult {
  scanned: number;
  anchored: number;
  skipped: number;
  errors: number;
}

/**
 * 未アンカーの確定済み高額/シリアル装着を拾ってアンカーする（cron・全テナント横断）。
 */
export async function anchorPendingInstallations(limit = 25): Promise<AnchorRunResult> {
  const admin = createServiceRoleAdmin("cron — parts high_value 個別アンカー（全テナント横断）");

  const { data: candidates, error } = await admin
    .from("part_installations")
    .select("id, tenant_id, content_hash, part_kind")
    .eq("status", "customer_verified")
    .in("part_kind", ["high_value", "serialized"])
    .not("content_hash", "is", null)
    .order("customer_verified_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`anchor candidates load failed: ${error.message}`);

  const result: AnchorRunResult = { scanned: candidates?.length ?? 0, anchored: 0, skipped: 0, errors: 0 };
  if (!candidates || candidates.length === 0) return result;

  // 既にアンカー済みの装着を除外
  const ids = candidates.map((c) => c.id);
  const { data: existing } = await admin
    .from("part_installation_anchors")
    .select("installation_id")
    .in("installation_id", ids);
  const anchoredSet = new Set((existing ?? []).map((a) => a.installation_id));

  for (const c of candidates) {
    if (anchoredSet.has(c.id)) {
      result.skipped++;
      continue;
    }
    try {
      const res = await anchorToPolygon(c.content_hash);
      if (!res.anchored || !res.txHash) {
        // 無効化環境（POLYGON_ANCHOR_ENABLED=false）等は skip
        result.skipped++;
        continue;
      }
      const { error: insErr } = await admin.from("part_installation_anchors").insert({
        tenant_id: c.tenant_id,
        installation_id: c.id,
        content_hash: c.content_hash,
        polygon_tx_hash: res.txHash,
        polygon_network: res.network,
      });
      if (insErr) {
        // unique 競合（並行実行）は skip 扱い
        result.skipped++;
        continue;
      }
      result.anchored++;
    } catch (e) {
      console.error(`[parts-anchor] failed for installation ${c.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

export interface MetaAnchorRunResult {
  vehiclesScanned: number;
  reanchored: number;
  unchanged: number;
  errors: number;
}

/**
 * 確定済み装着を持つ車両ごとに「部品メタアンカー」を再計算する（§6.5・全件）。
 * meta_hash が前回と同じなら no-op（無償）。変化した車両のみ再アンカーする。
 */
export async function recomputeVehicleMetaAnchors(limit = 25): Promise<MetaAnchorRunResult> {
  const admin = createServiceRoleAdmin("cron — parts 車両単位メタアンカー（全テナント横断）");
  const result: MetaAnchorRunResult = { vehiclesScanned: 0, reanchored: 0, unchanged: 0, errors: 0 };

  // 確定済み・vehicle紐付け・content_hash あり の装着を集め、車両ごとに束ねる
  const { data: rows, error } = await admin
    .from("part_installations")
    .select("vehicle_id, tenant_id, content_hash")
    .eq("status", "customer_verified")
    .not("vehicle_id", "is", null)
    .not("content_hash", "is", null)
    .order("customer_verified_at", { ascending: true })
    .limit(limit * 40);
  if (error) throw new Error(`meta candidates load failed: ${error.message}`);
  if (!rows || rows.length === 0) return result;

  const byVehicle = new Map<string, { tenantId: string; hashes: string[] }>();
  for (const r of rows) {
    const v = r.vehicle_id as string;
    const entry = byVehicle.get(v) ?? { tenantId: r.tenant_id as string, hashes: [] };
    entry.hashes.push(r.content_hash as string);
    byVehicle.set(v, entry);
  }

  const vehicles = [...byVehicle.entries()].slice(0, limit);
  result.vehiclesScanned = vehicles.length;

  for (const [vehicleId, { tenantId, hashes }] of vehicles) {
    try {
      const { metaHash, contributing } = computePartsMetaHash(vehicleId, hashes);

      const { data: existing } = await admin
        .from("part_vehicle_meta_anchors")
        .select("meta_hash")
        .eq("vehicle_id", vehicleId)
        .maybeSingle();
      if (existing?.meta_hash === metaHash) {
        result.unchanged++;
        continue;
      }

      const anchor = await anchorToPolygon(metaHash);
      const now = new Date().toISOString();
      const { error: upErr } = await admin.from("part_vehicle_meta_anchors").upsert(
        {
          tenant_id: tenantId,
          vehicle_id: vehicleId,
          meta_hash: metaHash,
          content_hash_count: contributing.length,
          polygon_tx_hash: anchor.anchored ? anchor.txHash : null,
          polygon_network: anchor.anchored ? anchor.network : null,
          anchored_at: anchor.anchored ? now : null,
          updated_at: now,
        },
        { onConflict: "vehicle_id" },
      );
      if (upErr) throw new Error(upErr.message);
      result.reanchored++;
    } catch (e) {
      console.error(`[parts-meta-anchor] failed for vehicle ${vehicleId}:`, e);
      result.errors++;
    }
  }

  return result;
}
