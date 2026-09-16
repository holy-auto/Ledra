import { NextRequest } from "next/server";
import { z } from "zod";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getSquareContext, SquareApiError, SquareNotConnectedError, squareFetch } from "@/lib/square/client";

export const dynamic = "force-dynamic";

interface DeviceCode {
  id: string;
  code: string;
  status: "UNKNOWN" | "UNPAIRED" | "PAIRED" | "EXPIRED";
  device_id?: string;
}

const createSchema = z.object({ name: z.string().trim().min(1).max(40).default("Ledra POS") });

function squareError(e: unknown) {
  if (e instanceof SquareNotConnectedError) {
    const notConnected = e.reason === "not_connected";
    return apiJson(
      {
        error: e.message,
        reason: e.reason,
        message: notConnected
          ? "Square が接続されていません。設定から接続してください。"
          : "Square の接続が切れています。設定から接続し直してください。",
      },
      { status: notConnected ? 409 : 502 },
    );
  }
  if (e instanceof SquareApiError) return apiJson({ error: "square_api_error", message: e.detail }, { status: 502 });
  return null;
}

/**
 * POST: Square 端末とペアリングするためのコードを発行する。
 *
 * 店員は端末に出た画面でこのコードを入力する。ペアリングが済むと Square 側で
 * `device_id` が確定するので、GET で確認して `square_connections` に保存する。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);
    if (!ctx.locationId) {
      return apiJson(
        { error: "square_location_missing", message: "Square の店舗情報が取得できていません。" },
        { status: 409 },
      );
    }

    const res = await squareFetch<{ device_code: DeviceCode }>(ctx.accessToken, "/v2/devices/codes", {
      method: "POST",
      body: {
        idempotency_key: crypto.randomUUID(),
        device_code: { name: parsed.data.name, product_type: "TERMINAL_API", location_id: ctx.locationId },
      },
    });

    return apiOk({ device_code_id: res.device_code.id, code: res.device_code.code, status: res.device_code.status });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square device POST");
  }
}

/**
 * GET: ペアリングの結果を確認し、済んでいれば端末 ID を保存する。
 *
 * ここで保存して初めて、会計画面から端末に QR を出せるようになる。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const codeId = req.nextUrl.searchParams.get("device_code_id");
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 状態だけ聞かれた場合（設定画面の初期表示）
    if (!codeId) {
      const ctx = await getSquareContext(admin, caller.tenantId);
      return apiOk({ status: ctx.terminalDeviceId ? "PAIRED" : "UNPAIRED", device_id: ctx.terminalDeviceId });
    }

    const ctx = await getSquareContext(admin, caller.tenantId);
    const res = await squareFetch<{ device_code: DeviceCode }>(
      ctx.accessToken,
      `/v2/devices/codes/${encodeURIComponent(codeId)}`,
    );
    const deviceId = res.device_code.device_id ?? null;

    if (res.device_code.status === "PAIRED" && deviceId) {
      const { error } = await admin
        .from("square_connections")
        .update({ square_terminal_device_id: deviceId })
        .eq("tenant_id", caller.tenantId);
      // 保存できないとペアリングが「済んだのに使えない」状態になる。黙って ok にしない
      if (error) return apiInternalError(error, "square device pairing save");
    }

    return apiOk({ status: res.device_code.status, device_id: deviceId });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square device GET");
  }
}

/** DELETE: 端末の紐付けを外す（Square 側の端末は解除しない）。 */
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("square_connections")
      .update({ square_terminal_device_id: null })
      .eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "square device DELETE");
    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e, "square device DELETE");
  }
}
