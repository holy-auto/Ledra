/**
 * エッジデバイスからのイベント受信 API
 *
 * POST /api/edge/events
 *
 * エッジデバイス（スマートグラス、工場カメラ等）はこのエンドポイントに
 * HMAC-SHA256 署名付きイベントをポストする。
 *
 * 認証: Bearer トークン = デバイスシークレット
 * 署名: HMAC-SHA256(secret, eventId:deviceTimestamp:payloadJson)
 */

import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { authenticateDevice, hashDeviceSecret, verifyDeviceSignature } from "@/lib/edge/deviceRegistry";
import { ingestEdgeEvent } from "@/lib/edge/eventIngestion";
import type { IngestEventRequest } from "@/lib/edge/types";

export const dynamic = "force-dynamic";

/** Authorization ヘッダから Bearer トークンを取得 */
function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/** X-Tenant-ID ヘッダからテナント ID を取得（デバイスは tenantId を知っている） */
function extractTenantId(req: NextRequest): string | null {
  return req.headers.get("x-tenant-id") ?? null;
}

export async function POST(req: NextRequest) {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    return apiError({ code: "unauthorized", message: "X-Tenant-ID ヘッダが必要です", status: 401 });
  }

  const secret = extractBearerToken(req);
  if (!secret) return apiUnauthorized("デバイスシークレットが必要です");

  const body = await parseJsonSafe<IngestEventRequest>(req);
  if (!body) return apiValidationError("リクエストボディが不正です");

  if (!body.deviceId || typeof body.deviceId !== "string") {
    return apiValidationError("deviceId は必須です");
  }
  if (!body.eventId || typeof body.eventId !== "string") {
    return apiValidationError("eventId は必須です");
  }
  if (!body.deviceTimestamp || typeof body.deviceTimestamp !== "string") {
    return apiValidationError("deviceTimestamp は必須です");
  }
  if (!body.signature || typeof body.signature !== "string") {
    return apiValidationError("signature は必須です");
  }
  if (!body.payload || typeof body.payload !== "object") {
    return apiValidationError("payload は必須です");
  }

  // デバイス認証: DB のハッシュと比較
  const secretHash = hashDeviceSecret(secret);
  const device = await authenticateDevice(tenantId, body.deviceId, secretHash).catch(() => null);
  if (!device) return apiUnauthorized("デバイス認証失敗");

  // HMAC 署名検証
  const payloadJson = JSON.stringify(body.payload);
  const signatureValid = verifyDeviceSignature(secret, body.eventId, body.deviceTimestamp, payloadJson, body.signature);
  if (!signatureValid) return apiUnauthorized("署名検証失敗");

  const result = await ingestEdgeEvent(tenantId, device.id, body).catch((e: Error) => apiInternalError(e));
  if (result instanceof Response) return result;

  return apiOk({ eventId: result.eventId, status: result.status, contentHash: result.contentHash }, 201);
}
