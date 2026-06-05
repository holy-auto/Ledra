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
import { logger } from "@/lib/logger";

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

/** 再アンカー判定に使う候補車両（確定装着を持つ）。 */
export interface MetaAnchorCandidate {
  vehicleId: string;
  tenantId: string;
  /** この車両の最新の customer_verified_at（ISO8601）。 */
  latestVerifiedAt: string;
}

/** 既存メタアンカーの最小情報（dirty 判定用）。 */
export interface ExistingMetaAnchor {
  metaHash: string;
  /** 前回 (再)アンカー or checkpoint 時刻（ISO8601）。 */
  updatedAt: string;
  /** Polygon tx が付与済みか（未付与＝アンカー失敗のリトライ対象）。 */
  hasTx: boolean;
}

/**
 * (再)アンカーが必要な車両を「直近アクティビティ順」で選定する純関数。
 *
 * 車両が dirty（要処理）なのは次のいずれか:
 *  - まだメタアンカーが無い（新規車両・過去バグの取りこぼし）
 *  - 前回アンカー以降に新しい確定装着がある（updatedAt < latestVerifiedAt）
 *  - 前回のアンカーに Polygon tx が付かなかった（リトライ）
 *
 * `candidates` は最新確定が先（DESC）で渡す想定。車両重複は最初の出現（＝最新）を採用。
 *
 * @security 旧実装は customer_verified_at ASC 固定で「最古 limit 台」だけを毎回再処理し、
 * それ以降（新規車両を含む）が永久に未アンカーになる starvation があった。dirty な車両を
 * 直近順で拾い、処理後に updated_at を進めて dirty 集合から外すことで確実に前進する。
 */
export function selectVehiclesToReanchor(
  candidates: MetaAnchorCandidate[],
  existing: Map<string, ExistingMetaAnchor>,
  limit: number,
): MetaAnchorCandidate[] {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const dirty: MetaAnchorCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.vehicleId)) continue;
    seen.add(c.vehicleId);
    const a = existing.get(c.vehicleId);
    const isDirty = !a || !a.hasTx || new Date(a.updatedAt).getTime() < new Date(c.latestVerifiedAt).getTime();
    if (isDirty) {
      dirty.push(c);
      if (dirty.length >= limit) break;
    }
  }
  return dirty;
}

/**
 * 確定済み装着を持つ車両ごとに「部品メタアンカー」を再計算する（§6.5・全件）。
 *
 * 直近に確定アクティビティのある車両を起点に、(再)アンカーが必要な車両のみを処理する。
 * 各車両は「その車両の全確定 content_hash（完全集合）」で meta_hash を計算するため、
 * 装着件数が多くても部分集合でハッシュを誤計算しない。meta_hash が不変かつ tx 付与済みなら
 * checkpoint（updated_at）だけ進めて無償で完了し、次回以降 dirty から外れる（前進性を担保）。
 */
export async function recomputeVehicleMetaAnchors(limit = 25): Promise<MetaAnchorRunResult> {
  const admin = createServiceRoleAdmin("cron — parts 車両単位メタアンカー（全テナント横断）");
  const result: MetaAnchorRunResult = { vehiclesScanned: 0, reanchored: 0, unchanged: 0, errors: 0 };

  // 1) 直近に確定した装着から候補車両を発見する（最新が先）。
  const { data: recentRows, error } = await admin
    .from("part_installations")
    .select("vehicle_id, tenant_id, customer_verified_at")
    .eq("status", "customer_verified")
    .not("vehicle_id", "is", null)
    .not("content_hash", "is", null)
    .order("customer_verified_at", { ascending: false })
    .limit(limit * 40);
  if (error) throw new Error(`meta candidates load failed: ${error.message}`);
  if (!recentRows || recentRows.length === 0) return result;

  const candidates: MetaAnchorCandidate[] = recentRows
    .filter((r) => r.vehicle_id && r.customer_verified_at)
    .map((r) => ({
      vehicleId: r.vehicle_id as string,
      tenantId: r.tenant_id as string,
      latestVerifiedAt: r.customer_verified_at as string,
    }));

  // 2) 候補車両の既存アンカーをまとめて取得（IN を 300 件ずつに分割して URL 長を抑える）。
  const distinctIds = [...new Set(candidates.map((c) => c.vehicleId))];
  const existing = new Map<string, ExistingMetaAnchor>();
  for (let i = 0; i < distinctIds.length; i += 300) {
    const chunk = distinctIds.slice(i, i + 300);
    const { data: anchors, error: aErr } = await admin
      .from("part_vehicle_meta_anchors")
      .select("vehicle_id, meta_hash, updated_at, polygon_tx_hash")
      .in("vehicle_id", chunk);
    if (aErr) throw new Error(`meta anchors load failed: ${aErr.message}`);
    for (const a of anchors ?? []) {
      existing.set(a.vehicle_id as string, {
        metaHash: (a.meta_hash as string) ?? "",
        updatedAt: (a.updated_at as string) ?? "1970-01-01T00:00:00.000Z",
        hasTx: !!a.polygon_tx_hash,
      });
    }
  }

  // 3) (再)アンカーが必要な車両を選定（純ロジック）。
  const toProcess = selectVehiclesToReanchor(candidates, existing, limit);
  result.vehiclesScanned = toProcess.length;

  // 4) 各車両を「完全集合」で再計算してアンカー。
  for (const { vehicleId, tenantId } of toProcess) {
    try {
      const { data: hashRows, error: hErr } = await admin
        .from("part_installations")
        .select("content_hash")
        .eq("status", "customer_verified")
        .eq("vehicle_id", vehicleId)
        .not("content_hash", "is", null);
      if (hErr) throw new Error(hErr.message);

      const { metaHash, contributing } = computePartsMetaHash(
        vehicleId,
        (hashRows ?? []).map((r) => r.content_hash as string),
      );

      const prev = existing.get(vehicleId);
      const now = new Date().toISOString();

      // meta_hash 不変かつ前回 tx 付与済み → 何もせず checkpoint だけ進める（無償）。
      if (prev && prev.metaHash === metaHash && prev.hasTx) {
        const { error: bumpErr } = await admin
          .from("part_vehicle_meta_anchors")
          .update({ updated_at: now })
          .eq("vehicle_id", vehicleId);
        if (bumpErr) throw new Error(bumpErr.message);
        result.unchanged++;
        continue;
      }

      // 変更あり / 未アンカー / tx 欠落（リトライ）→ 再アンカー。
      const anchor = await anchorToPolygon(metaHash);
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
      logger.error("[parts-meta-anchor] failed", {
        vehicleId,
        error: e instanceof Error ? e.message : String(e),
      });
      result.errors++;
    }
  }

  return result;
}
