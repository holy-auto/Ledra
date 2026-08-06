/**
 * 公開: 車両全履歴レポートの都度課金チェックアウト (アカウント不要)
 *
 * POST /api/public/vehicle-report/checkout
 * body: { vin: string, source_public_id?: string }
 *
 * 第三者 (買取店・整備工場 等) が /v/[vin] の施工履歴レポートを
 * 閲覧するための Stripe Checkout (mode=payment / JPY) を作成する。
 * 段階式ティア (vehicle_report_tiers) の価格・開示スコープを用いる。
 *
 * セキュリティ:
 *   - 任意 VIN での課金を防ぐため、vehicle_passports に実在する
 *     VIN のみチェックアウト可能 (404)
 *   - 金額・スコープはサーバ側ティアから決定 (クライアント値は信用しない)
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
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { getVehicleReportSettings, generateReportAccessToken } from "@/lib/vehicleReport/access";
import { getReportTierByKey, scopeCutoffIso } from "@/lib/vehicleReport/tiers";

const schema = z.object({
  vin: z.string().trim().min(1).max(64),
  source_public_id: z.string().trim().max(128).optional(),
  // Which staged tier to buy. Omitted → the full-history tier (back-compat).
  tier: z.string().trim().max(64).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  return getStripeClient();
}

export async function POST(req: NextRequest) {
  if (!isPassportPublicEnabled()) {
    return apiNotFound("Not Found");
  }
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

    // Resolve the purchased tier (price + disclosure scope). Client-supplied
    // amounts are never trusted — price and scope come from the tier row.
    // Fall back to the "full" tier (or, if unseeded, the flat settings price).
    const requestedTier = parsed.data.tier ?? "full";
    const tier = (await getReportTierByKey(requestedTier)) ?? (await getReportTierByKey("full"));
    if (parsed.data.tier && !tier) {
      return apiValidationError("指定のレポート種別は購入できません。");
    }
    const priceJpy = tier?.price_jpy ?? settings.price_jpy;
    const tierKey = tier?.tier_key ?? null;
    const scopeType = tier?.scope.type ?? "full";
    const scopeMonths = tier && tier.scope.type === "recent_months" ? tier.scope.months : null;
    // Anchor the disclosure cutoff at purchase time (absolute), so display and
    // revenue-share never drift over the access window.
    const scopeFrom = tier ? scopeCutoffIso(tier.scope, Date.now()) : null;
    const productName = tier?.label ?? "車両全履歴レポート";
    const productDesc =
      scopeType === "recent_months"
        ? `VIN ${vin} の直近${scopeMonths}ヶ月の施工履歴 (ブロックチェーン認証済み)`
        : `VIN ${vin} の全施工履歴 (ブロックチェーン認証済み)`;

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
        amount_jpy: priceJpy,
        tier_key: tierKey,
        scope_type: scopeType,
        scope_months: scopeMonths,
        scope_from: scopeFrom,
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
                name: productName,
                description: productDesc,
              },
              unit_amount: priceJpy,
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
