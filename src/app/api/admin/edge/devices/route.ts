/**
 * エッジデバイス管理 API（店舗管理者向け）
 *
 * GET  /api/admin/edge/devices       - デバイス一覧
 * POST /api/admin/edge/devices       - デバイス登録（シークレットは一度のみ返す）
 */

import { apiOk, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { registerDevice, listDevices } from "@/lib/edge/deviceRegistry";
import type { RegisterDeviceInput, EdgeDeviceKind } from "@/lib/edge/types";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS: EdgeDeviceKind[] = [
  "smart_glasses",
  "ip_camera",
  "obd_dongle",
  "torque_wrench",
  "thickness_gauge",
  "barcode_scanner",
  "mobile_device",
];

export const GET = withCaller(
  async (_req, { caller }) => {
    const devices = await listDevices(caller.tenantId).catch((e: Error) => apiInternalError(e));
    if (devices instanceof Response) return devices;

    return apiOk({ devices });
  },
  { routeName: "admin/edge/devices GET" },
);

export const POST = withCaller(
  async (req, { caller }) => {
    // 端末登録は admin 以上 (代表判断 2026-09-01)

    const body = await parseJsonSafe<RegisterDeviceInput>(req);
    if (!body) return apiError({ code: "validation_error", message: "リクエストボディが不正です", status: 400 });

    if (!body.kind || !ALLOWED_KINDS.includes(body.kind)) {
      return apiValidationError(`kind は次のいずれかを指定: ${ALLOWED_KINDS.join(", ")}`);
    }

    if (!body.displayName || typeof body.displayName !== "string" || body.displayName.trim().length === 0) {
      return apiValidationError("displayName は必須です");
    }

    const result = await registerDevice(caller.tenantId, caller.userId, {
      kind: body.kind,
      displayName: body.displayName.trim(),
      firmwareVersion: body.firmwareVersion,
      metadata: body.metadata,
    }).catch((e: Error) => apiInternalError(e));

    if (result instanceof Response) return result;

    // シークレットは一度のみ返す — DB には保存しない
    return apiOk(
      {
        device: result.device,
        secret: result.secret,
        secretNote: "このシークレットは一度のみ表示されます。安全に保管してください。",
      },
      201,
    );
  },
  { permission: "settings:edit", routeName: "admin/edge/devices POST" },
);
