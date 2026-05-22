/**
 * 公開: 車両全履歴レポートの都度課金チェックアウト (アカウント不要)
 *
 * POST /api/public/vehicle-report/checkout
 * body: { vin: string, source_public_id?: string }
 *
 * 第三者 (買取店・整備工場 等) が /v/[vin] の全履歴レポートを
 * 閲覧するための Stripe Checkout (mode=payment / JPY) を作成する。
 * 価格は vehicle_report_settings (プラットフォーム共通) から取得。
 *
 * セキュリティ:
 *   - 任意 VIN での課金を防ぐため、vehicle_passports に実在する
 *     VIN のみチェックアウト可能 (404)
 *   - 金額はサーバ側 settings から決定 (クライアント値は信用しない)
 *   - レート制限 `auth` プリセット (Stripe API 浪費の防止)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiValidationError, apiNotFound, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { getVehicleReportSettings, generateReportAccessToken } from "@/lib/vehicleReport/access";

const schema = z.object({
  vin: z.string().trim().min(1).max(64),
  source_public_id: z.string().trim().max(128).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  return getStripeClient();
}

export async function POST(req: NextRequest) {
  // Each call hits Stripe to create a Checkout session. Auth preset
  // (10/min/IP) bounds Stripe API spend if the endpoint is abused.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const vin = normalizeVin(parsed.data.vin);
    if (!vin) return apiValidationError("VIN が不正です。");

    const admin = createServiceRoleAdmin("vehicle report checkout — anonymous buyer, VIN-keyed passport");

    // Only VINs with a real passport can be purchased.
    const { data: passport } = await admin
      .from("vehicle_passports")
      .select("vin_code_normalized")
      .eq("vin_code_normalized", vin)
      .maybeSingle();
    if (!passport) return apiNotFound("対象車両の履歴が見つかりません。");

    const settings = await getVehicleReportSettings();
    if (!settings.enabled) {
      return apiForbidden("車両履歴レポートの販売は現在停止しています。");
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("Missing APP_URL");

    const accessToken = generateReportAccessToken();

    // Step 1: 仮レコード作成 (order_id を先に確保)
    const { data: order, error: oErr } = await admin
      .from("vehicle_report_orders")
      .insert({
        vin_code_normalized: vin,
        source_public_id: parsed.data.source_public_id ?? null,
        access_token: accessToken,
        status: "pending",
        amount_jpy: settings.price_jpy,
      })
      .select("id")
      .single();

    if (oErr) return apiInternalError(oErr, "vehicle_report_orders insert");

    const stripe = getStripe();

    // Step 2: Stripe Checkout Session 作成
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        metadata: {
          vehicle_report_order_id: order.id,
          vin,
        },
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: "車両全履歴レポート",
                description: `VIN ${vin} の全施工履歴 (ブロックチェーン認証済み)`,
              },
              unit_amount: settings.price_jpy,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/api/public/vehicle-report/unlock?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/v/${encodeURIComponent(vin)}?canceled=1`,
      });
    } catch (stripeErr) {
      // Stripe 失敗 → 孤立した pending order を expired にしておく。
      await admin.from("vehicle_report_orders").update({ status: "expired" }).eq("id", order.id);
      throw stripeErr;
    }

    // Step 3: セッション ID を記録
    await admin
      .from("vehicle_report_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "vehicle-report checkout");
  }
}
