import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { posQrSessionSchema } from "@/lib/validations/pos";
import { createPosCheckoutSession } from "@/lib/stripe/posCheckoutSession";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/pos/checkout/qr-session
 *
 * Android端末向け：Stripe Checkout Session を作成し、
 * お客様のスマホで読み込めるQR URL を返す。
 *
 * 入金先: テナントの Stripe Connect アカウント（tenants.stripe_connect_account_id）
 * フィー: なし（POS決済はStripeの決済手数料のみ施工店負担）
 *
 * レスポンス:
 *   { url: string, session_id: string }
 */
/**
 * DELETE /api/mobile/pos/checkout/qr-session?session_id=cs_xxx
 *
 * 会計をやめた時に Checkout Session を失効させる。
 *
 * なぜ要るか: セッションは 30 分生きる。店の端末で決済ページを開いたまま
 * 会計をやめると、**誰もポーリングしていない支払リンクが残る**。後から
 * 決済されると、カードは切られたのに売上として記録されない。
 */
export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "mobile_pos");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return apiValidationError("invalid session_id");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();
    const connectAccountId = tenantRow?.stripe_connect_onboarded
      ? (tenantRow.stripe_connect_account_id as string | null)
      : null;

    try {
      await stripeExpire(sessionId, connectAccountId);
    } catch {
      // 既に完了・失効している場合もここに来る。やめた側の操作は止めない
    }
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/qr-session DELETE");
  }
}

/** 決済済み・失効済みなら Stripe 側が弾く。呼び出し側で握り潰す */
async function stripeExpire(sessionId: string, connectAccountId: string | null) {
  const stripe = getStripeClient();
  await stripe.checkout.sessions.expire(sessionId, connectAccountId ? { stripeAccount: connectAccountId } : undefined);
}

export async function POST(req: NextRequest) {
  // Each call creates a Stripe Checkout Session via the tenant's Connect
  // account. mobile_pos preset (10/min/IP) matches the rest of the POS
  // checkout family.
  const limited = await checkRateLimit(req, "mobile_pos");
  if (limited) return limited;

  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) {
      return apiUnauthorized();
    }

    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const parsed = posQrSessionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { amount } = parsed.data;
    // 入金先はトークンのテナント。ペイロードの tenant_id は見ない
    const tenantId = caller.tenantId;
    const reservationId = parsed.data.reservation_id ?? "";
    const storeId = parsed.data.store_id ?? "";

    // テナントの Stripe Connect アカウント取得
    // ※ tenants テーブルのカラムは stripe_connect_account_id / stripe_connect_onboarded
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", tenantId)
      .single();

    const connectAccountId = tenantRow?.stripe_connect_onboarded
      ? (tenantRow.stripe_connect_account_id as string | null)
      : null;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return apiInternalError(new Error("stripe not configured"), "mobile/pos/qr-session");
    }

    const stripe = getStripeClient();

    // Checkout Session 作成（お客様が自分のスマホで決済）
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ledra.co.jp";
    const successUrl = `${baseUrl}/pos/qr-complete?reservation_id=${reservationId}`;

    const sessionParams: Omit<Stripe.Checkout.SessionCreateParams, "payment_method_types"> = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jpy",
            unit_amount: amount,
            product_data: {
              name: "施工料金",
              metadata: {
                reservation_id: reservationId,
                store_id: storeId,
              },
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_id: reservationId,
        tenant_id: tenantId,
        store_id: storeId,
        cashier_id: caller.userId,
        source: "ledra_mobile_qr",
      },
      success_url: successUrl,
      cancel_url: successUrl, // キャンセル時も同じページ（スタッフ側でポーリング検知）
      // セッション有効期限: 30分
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    };

    // Connect アカウントがオンボーディング済みの場合はそのアカウントで決済
    // → 入金先: 施工店の Stripe Connect アカウント（施工店の銀行口座）
    // → フィー: なし（POS決済はプラットフォームフィー不要）
    const stripeOptions = connectAccountId ? { stripeAccount: connectAccountId } : undefined;

    const session = await createPosCheckoutSession(stripe, amount, sessionParams, stripeOptions);

    return apiJson({
      url: session.url,
      session_id: session.id,
      connect_account: connectAccountId ?? null,
      payment_method_types: session.payment_method_types,
    });
  } catch (e) {
    return apiInternalError(e, "mobile/pos/checkout/qr-session");
  }
}
