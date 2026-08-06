import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { apiForbidden, apiInternalError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/pos/terminal/location
 *
 * Stripe Terminal の location_id をテナントごとに払い出す。
 * Tap to Pay では `discoverReaders` 直後の `connectReader` で必須。
 *
 * 動作:
 *   1) テナントの Stripe Connect アカウントに既存ロケーションがあれば
 *      最初の1件を返す
 *   2) 無ければ簡易な「店舗名」+「日本住所」で1件作成して返す
 *
 * 将来の拡張ポイント:
 *   - 店舗 (stores) ごとに 1 location を持たせる
 *   - 住所をテナント設定から自動投入
 */
export async function GET(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "mobile_terminal");
    if (limited) return limited;

    const caller = await resolveMobileCaller(req);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // テナントの Stripe Connect アカウントを取得
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, stripe_connect_account_id, stripe_connect_onboarded, address")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;
    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return apiInternalError(new Error("stripe not configured"), "mobile/pos/terminal/location");
    }
    const stripe = getStripeClient();

    // 1) 既存ロケーションを検索
    const list = await stripe.terminal.locations.list({ limit: 1 }, stripeOptions);
    if (list.data.length > 0) {
      return apiJson({ location_id: list.data[0].id });
    }

    // 2) 無ければ作成 (最低限の住所で OK)
    const name = (tenant?.name as string | null) ?? "Ledra Store";
    const address = (tenant?.address as Record<string, string> | null) ?? {};
    // 日本アカウントの Terminal Location は標準の `address` ではなく
    // `address_kanji`(/`address_kana`) で送る必要がある。`address` を使うと
    // Stripe が 400 (`The address field cannot be used for addresses in JP.
    // Use address_kana or address_kanji instead.`) を返し、Location を作成でき
    // ない（＝Tap to Pay の location 取得が常に失敗する）。手元にあるのは
    // 漢字表記の住所なので address_kanji に投入する。
    const created = await stripe.terminal.locations.create(
      {
        display_name: name.slice(0, 100),
        address_kanji: {
          country: "JP",
          postal_code: address.postal_code ?? "1000001",
          state: address.state ?? "東京都",
          city: address.city ?? "千代田区",
          line1: address.line1 ?? "1-1-1",
          ...(address.line2 ? { line2: address.line2 } : {}),
        },
      },
      stripeOptions,
    );

    return apiJson({ location_id: created.id });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/terminal/location");
  }
}
