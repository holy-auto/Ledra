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
import { getSquareContext, SquareApiError, SquareNotConnectedError } from "@/lib/square/client";
import { cancelTerminalCheckout, createTerminalQrCheckout, getTerminalCheckout } from "@/lib/square/qrCheckout";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  reference_id: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

function squareError(e: unknown) {
  if (e instanceof SquareNotConnectedError) {
    return apiJson(
      { error: e.message, message: "Square が接続されていません。設定から接続してください。" },
      { status: 409 },
    );
  }
  if (e instanceof SquareApiError) {
    return apiJson({ error: "square_api_error", message: e.detail }, { status: 502 });
  }
  return null;
}

/**
 * POST: Square の端末にマルチブランド QR を出す（PayPay / d払い / 楽天ペイ /
 * au PAY / メルペイ / WeChat Pay / Alipay+）。
 *
 * 端末が繋がっていない店には `mode: "pos_app"` を返す —— Square の QR は
 * **対面決済専用**で、Square のアプリか端末でしか表示できない。その場合は
 * 店の Square アプリで会計してもらい、`/api/admin/pos/checkout` の
 * `square_reconcile` で Ledra に引き当てる。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);

    if (!ctx.terminalDeviceId) {
      return apiOk({ mode: "pos_app" as const, checkout_id: null });
    }

    const checkout = await createTerminalQrCheckout({
      accessToken: ctx.accessToken,
      deviceId: ctx.terminalDeviceId,
      amountJpy: parsed.data.amount,
      // 端末側の二重表示を防ぐ。同じ会計をやり直しても Square 側は1件
      idempotencyKey: `ledra:${caller.tenantId}:${parsed.data.reference_id ?? crypto.randomUUID()}`,
      referenceId: parsed.data.reference_id,
      note: parsed.data.note,
    });

    return apiOk({ mode: "terminal" as const, checkout_id: checkout.id, status: checkout.status });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout POST");
  }
}

/** GET: 端末のチェックアウト状態（会計画面のポーリング用）。 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiValidationError("invalid_id");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);
    const checkout = await getTerminalCheckout(ctx.accessToken, id);

    return apiOk({
      id: checkout.id,
      status: checkout.status,
      cancel_reason: checkout.cancel_reason ?? null,
      // 記録はサーバが Square から取り直して確かめる。ここでは進捗だけ返す
      paid: checkout.status === "COMPLETED",
    });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout GET");
  }
}

/**
 * DELETE: 会計をやめたときに端末の QR を消す。
 *
 * 残すと、**店員が現金会計に切り替えた後で客が QR を読んで二重に払える**。
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiValidationError("invalid_id");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const ctx = await getSquareContext(admin, caller.tenantId);
    try {
      await cancelTerminalCheckout(ctx.accessToken, id);
    } catch {
      // 既に完了・取消済みならここに来る。やめた側の操作は止めない
    }
    return apiOk({ ok: true });
  } catch (e) {
    return squareError(e) ?? apiInternalError(e, "square qr-checkout DELETE");
  }
}
