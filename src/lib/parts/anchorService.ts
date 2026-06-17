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

/** 個別アンカー対象の part_kind（高額・シリアル品）。クエリと判定で共有する単一の真実。 */
export const ANCHOR_PART_KINDS = ["high_value", "serialized"] as const satisfies readonly PartKind[];

/** 個別アンカー対象か（高額・シリアル品）。純関数。 */
export function shouldAnchorKind(kind: PartKind): boolean {
  return (ANCHOR_PART_KINDS as readonly PartKind[]).includes(kind);
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
    .in("part_kind", [...ANCHOR_PART_KINDS])
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
        if (insErr.code === "23505") {
          // unique 競合（並行実行で既にアンカー済み）は skip 扱い
          result.skipped++;
        } else {
          // それ以外（一時障害等）は握りつぶさず error 計上＋可視化
          logger.error("[parts-anchor] anchor insert failed", {
            installationId: c.id,
            error: insErr.message,
          });
          result.errors++;
        }
        continue;
      }
      result.anchored++;
    } catch (e) {
      logger.error("[parts-anchor] failed", {
        installationId: c.id,
        error: e instanceof Error ? e.message : String(e),
      });
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
 *  - 前回のアンカーに Polygon tx が付かなかった（リトライ; anchoringEnabled=false 時はスキップ）
 *
 * `candidates` は最新確定が先（DESC）で渡す想定。車両重複は最初の出現（＝最新）を採用。
 *
 * @security 旧実装は customer_verified_at ASC 固定で「最古 limit 台」だけを毎回再処理し、
 * それ以降（新規車両を含む）が永久に未アンカーになる starvation があった。dirty な車両を
 * 直近順で拾い、処理後に updated_at を進めて dirty 集合から外すことで確実に前進する。
 * 呼び出し側では dirty 台数が揃うまでページングするため、この関数は1ページ分だけを受け取る。
 */
export function selectVehiclesToReanchor(
  candidates: MetaAnchorCandidate[],
  existing: Map<string, ExistingMetaAnchor>,
  limit: number,
  anchoringEnabled = true,
): MetaAnchorCandidate[] {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const dirty: MetaAnchorCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.vehicleId)) continue;
    seen.add(c.vehicleId);
    const a = existing.get(c.vehicleId);
    const isDirty =
      !a || new Date(a.updatedAt).getTime() < new Date(c.latestVerifiedAt).getTime() || (anchoringEnabled && !a.hasTx);
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
 * dirty 台数が揃うまで verified installations をページングするため、直近ウィンドウが
 * 全て clean でも古い dirty 車両を取りこぼさない。各車両は「その車両の全確定
 * content_hash（完全集合）」で meta_hash を計算し、ウォーターマークには実際に
 * ハッシュに含めた行の max(customer_verified_at) を使う（並行 verified 行の
 * チェックポイント超過を防ぐ）。
 */
export async function recomputeVehicleMetaAnchors(limit = 25): Promise<MetaAnchorRunResult> {
  const admin = createServiceRoleAdmin("cron — parts 車両単位メタアンカー（全テナント横断）");
  const result: MetaAnchorRunResult = { vehiclesScanned: 0, reanchored: 0, unchanged: 0, errors: 0 };
  const anchoringEnabled = process.env.POLYGON_ANCHOR_ENABLED === "true";

  // dirty 台数が揃うまでページングする（固定ウィンドウでの starvation 回避）。
  const PAGE = limit * 10;
  let offset = 0;
  const seen = new Set<string>();
  const existing = new Map<string, ExistingMetaAnchor>();
  const toProcess: MetaAnchorCandidate[] = [];

  for (;;) {
    const { data: page, error } = await admin
      .from("part_installations")
      .select("vehicle_id, tenant_id, customer_verified_at")
      .eq("status", "customer_verified")
      .not("vehicle_id", "is", null)
      .not("content_hash", "is", null)
      .not("customer_verified_at", "is", null)
      .order("customer_verified_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`meta candidates load failed: ${error.message}`);
    if (!page || page.length === 0) break;

    const newIds: string[] = [];
    const pageVehicles: MetaAnchorCandidate[] = [];
    for (const r of page) {
      const vid = r.vehicle_id as string;
      if (seen.has(vid)) continue;
      seen.add(vid);
      newIds.push(vid);
      pageVehicles.push({
        vehicleId: vid,
        tenantId: r.tenant_id as string,
        latestVerifiedAt: r.customer_verified_at as string,
      });
    }

    for (let i = 0; i < newIds.length; i += 300) {
      const chunk = newIds.slice(i, i + 300);
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

    const remaining = limit - toProcess.length;
    toProcess.push(...selectVehiclesToReanchor(pageVehicles, existing, remaining, anchoringEnabled));

    if (toProcess.length >= limit) break;
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  result.vehiclesScanned = toProcess.length;
  if (toProcess.length === 0) return result;

  for (const { vehicleId, tenantId } of toProcess) {
    try {
      const { data: hashRows, error: hErr } = await admin
        .from("part_installations")
        .select("content_hash, customer_verified_at")
        .eq("status", "customer_verified")
        .eq("vehicle_id", vehicleId)
        .not("content_hash", "is", null);
      if (hErr) throw new Error(hErr.message);

      const hashes = (hashRows ?? []).map((r) => r.content_hash as string);
      // ウォーターマーク = 実際にハッシュに含めた行の max(customer_verified_at)。
      // この読み取り後に別行が確定されても customer_verified_at > checkpointAt となり
      // 次回 dirty と判定される（チェックポイントの超過を防ぐ）。
      const checkpointAt = (hashRows ?? [])
        .map((r) => r.customer_verified_at as string | null)
        .filter((s): s is string => !!s)
        .reduce((a, b) => (a > b ? a : b), "1970-01-01T00:00:00.000Z");

      const { metaHash, contributing } = computePartsMetaHash(vehicleId, hashes);

      const prev = existing.get(vehicleId);
      const now = new Date().toISOString();

      if (prev && prev.metaHash === metaHash && prev.hasTx) {
        const { error: bumpErr } = await admin
          .from("part_vehicle_meta_anchors")
          .update({ updated_at: checkpointAt })
          .eq("vehicle_id", vehicleId);
        if (bumpErr) throw new Error(bumpErr.message);
        result.unchanged++;
        continue;
      }

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
          updated_at: checkpointAt,
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
