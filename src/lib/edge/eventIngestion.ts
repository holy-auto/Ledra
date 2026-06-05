/**
 * エッジイベント受信・処理パイプライン
 *
 * 処理フロー:
 *   1. HMAC 署名検証（デバイス認証）
 *   2. 冪等性チェック（deviceEventId で重複排除）
 *   3. コンテンツハッシュ計算
 *   4. DB 保存
 *   5. 非同期 Polygon アンカー（after() パターン）
 *   6. AI 自動解析トリガー（anomaly_detected, quality_check 等）
 */

import { randomUUID } from "crypto";
import crypto from "crypto";
import { after } from "next/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { anchorToPolygon } from "@/lib/anchoring/providers/polygon";
import { authenticateDevice, touchDeviceLastSeen, verifyDeviceSignature, hashDeviceSecret } from "./deviceRegistry";
import type { EdgeEvent, EdgeEventPayload, IngestEventRequest } from "./types";

export interface IngestResult {
  eventId: string;
  status: "created" | "duplicate";
  contentHash: string;
}

/** イベントのコンテンツハッシュを計算 */
function computeEventContentHash(
  deviceId: string,
  eventId: string,
  deviceTimestamp: string,
  payload: EdgeEventPayload,
): string {
  const canonical = JSON.stringify({
    device_id: deviceId,
    event_id: eventId,
    device_timestamp: deviceTimestamp,
    payload,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** デバイスシークレットをヘッダから取得してデバイスを認証 */
export async function authenticateDeviceFromRequest(
  tenantId: string,
  req: IngestEventRequest,
  deviceSecret: string,
): Promise<{ deviceId: string } | null> {
  const secretHash = hashDeviceSecret(deviceSecret);
  const device = await authenticateDevice(tenantId, req.deviceId, secretHash);
  if (!device) return null;

  const payloadJson = JSON.stringify(req.payload);
  const valid = verifyDeviceSignature(deviceSecret, req.eventId, req.deviceTimestamp, payloadJson, req.signature);
  if (!valid) return null;

  return { deviceId: device.id };
}

/**
 * エッジイベントを受信して処理する。
 * デバイス認証は呼び出し元で完了済みであること。
 */
export async function ingestEdgeEvent(
  tenantId: string,
  deviceId: string,
  req: IngestEventRequest,
): Promise<IngestResult> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const contentHash = computeEventContentHash(deviceId, req.eventId, req.deviceTimestamp, req.payload);

  // 冪等性チェック: device_event_id で重複排除
  const { data: existing } = await admin
    .from("edge_events")
    .select("id, content_hash")
    .eq("tenant_id", tenantId)
    .eq("device_id", deviceId)
    .eq("device_event_id", req.eventId)
    .maybeSingle();

  if (existing) {
    return { eventId: existing.id, status: "duplicate", contentHash: existing.content_hash };
  }

  const eventId = randomUUID();
  const now = new Date().toISOString();

  const { error: insertErr } = await admin.from("edge_events").insert({
    id: eventId,
    tenant_id: tenantId,
    device_id: deviceId,
    device_event_id: req.eventId,
    kind: req.payload.kind,
    payload: req.payload,
    job_order_id: req.payload.jobOrderId ?? null,
    vehicle_id: req.payload.vehicleId ?? null,
    content_hash: contentHash,
    device_timestamp: req.deviceTimestamp,
    received_at: now,
    polygon_tx_hash: null,
    polygon_anchored_at: null,
  });

  if (insertErr) throw new Error(`edge_events insert failed: ${insertErr.message}`);

  // デバイス最終確認時刻を更新
  await touchDeviceLastSeen(tenantId, deviceId).catch(() => {});

  // 非同期 Polygon アンカー（レスポンスをブロックしない）
  after(async () => {
    const result = await anchorToPolygon(contentHash).catch(() => ({ txHash: null, anchored: false, network: null }));
    if (result.anchored && result.txHash) {
      const { admin: asyncAdmin } = createTenantScopedAdmin(tenantId);
      await asyncAdmin
        .from("edge_events")
        .update({
          polygon_tx_hash: result.txHash,
          polygon_network: result.network,
          polygon_anchored_at: new Date().toISOString(),
        })
        .eq("id", eventId);
    }
  });

  return { eventId, status: "created", contentHash };
}

/** テナントのイベント一覧を取得 */
export async function listEdgeEvents(
  tenantId: string,
  options: {
    deviceId?: string;
    jobOrderId?: string;
    kind?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<EdgeEvent[]> {
  const { admin } = createTenantScopedAdmin(tenantId);
  let query = admin
    .from("edge_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.deviceId) query = query.eq("device_id", options.deviceId);
  if (options.jobOrderId) query = query.eq("job_order_id", options.jobOrderId);
  if (options.kind) query = query.eq("kind", options.kind);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`edge_events list failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    deviceId: row.device_id,
    kind: row.kind,
    payload: row.payload as EdgeEventPayload,
    contentHash: row.content_hash,
    polygonTxHash: row.polygon_tx_hash ?? null,
    polygonAnchoredAt: row.polygon_anchored_at ?? null,
    receivedAt: row.received_at,
  }));
}
