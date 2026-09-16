import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { posCheckoutSchema } from "@/lib/validations/pos";
import { deductInventoryForPosItems } from "@/lib/pos/inventoryDeduction";
import { recordPosSale } from "@/lib/pos/recordSale";
import { resolvePaidCheckoutSession } from "@/lib/pos/checkoutSession";
import { resolvePosAppSale, resolveTerminalSale } from "@/lib/pos/squareSale";

export const dynamic = "force-dynamic";

// ─── POST: POS会計処理（モバイルアプリ用 Bearer Token 認証） ───
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) {
      return apiUnauthorized();
    }
    const client = caller.supabase;

    // staff以上のロールが必要
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    // Rate limiting: Upstash Redis ベース
    const limited = await checkRateLimit(req, "mobile_pos", caller.userId);
    if (limited) return limited;

    const parsed = posCheckoutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const { admin: rpcAdmin } = createTenantScopedAdmin(caller.tenantId);
    // pos_checkout は SECURITY DEFINER で、引数の tenant_id をそのまま使う。
    // 未認証・他テナントから呼ばれないよう service_role 専用にしたので、
    // 権限確認済みのこのルートからはサービスロールのクライアントで呼ぶ。
    //
    // カード決済で PaymentIntent が付いていれば、**同じ決済では1件しか作らない**
    // （記録に失敗して店員がやり直しても二重に売上が立たない）
    // カード番号決済（Checkout）なら、**サーバがセッションを取り直して**
    // 支払済みであることと金額を確かめる。クライアントの申告は信じない
    let paymentIntentId: string | null = null;
    let squarePaymentId: string | null = null;
    let args = input;
    if (input.checkout_session_id) {
      const paid = await resolvePaidCheckoutSession(rpcAdmin, caller.tenantId, input.checkout_session_id);
      if (!paid.ok) return apiValidationError(paid.error);
      paymentIntentId = paid.paymentIntentId;
      // 金額は Stripe の実額。カートを編集されていても請求額と一致させる。
      // 会計手段も Stripe の実績を優先する（PayPay で払われた会計を
      // 「カード」で記帳するとレジ締めが合わない）
      args = {
        ...input,
        amount: paid.amountTotal,
        received_amount: paid.amountTotal,
        payment_method: paid.paymentMethod ?? input.payment_method,
      };
    }

    // Square 経由の QR コード決済（PayPay / d払い / 楽天ペイ / au PAY / メルペイ /
    // WeChat Pay / Alipay+）。Stripe と同じく**サーバが Square から取り直して**
    // 支払済みと金額を確かめ、payment_id を冪等キーにする
    if (input.square_checkout_id || input.square_reconcile) {
      const paid = input.square_checkout_id
        ? await resolveTerminalSale(rpcAdmin, caller.tenantId, input.square_checkout_id)
        : await resolvePosAppSale(rpcAdmin, caller.tenantId, input.amount);
      if (!paid.ok) return apiValidationError(paid.error);
      squarePaymentId = paid.squarePaymentId;
      args = {
        ...args,
        amount: paid.amountTotal,
        received_amount: paid.amountTotal,
        // ブランドが何であれ Ledra の会計手段は「QR決済」
        payment_method: "qr",
      };
    }

    const sale = await recordPosSale(rpcAdmin, caller, args, paymentIntentId, squarePaymentId);
    if (!sale.ok) {
      return apiInternalError(sale.error, "mobile/pos/checkout");
    }
    if (sale.alreadyRecorded) {
      // 在庫は初回に引き落とし済み。ここで再度引くと二重に減る
      return apiJson({ ok: true, result: sale.result, already_recorded: true });
    }
    const data = sale.result;

    // 在庫紐付け商品があれば減算 (best-effort + outbox リトライ)
    const { admin: outboxAdmin } = createTenantScopedAdmin(caller.tenantId);
    const inventory = await deductInventoryForPosItems(client, args.items_json, {
      tenantId: caller.tenantId,
      paymentId: sale.paymentId,
      outboxAdmin,
    });

    return apiJson({ ok: true, result: data, inventory });
  } catch (e: unknown) {
    return apiInternalError(e, "mobile/pos/checkout");
  }
}
