import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createMobileClient, resolveMobileCaller } from "@/lib/supabase/mobile";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/pos/checkout/qr-status?session_id=xxx&tenant_id=xxx
 *
 * Stripe Checkout Session の支払い状態をポーリングする。
 * アプリ側は 3 秒ごとに叩き、status === "paid" になったら会計完了処理へ進む。
 *
 * ※ Connect アカウント配下のセッションを取得するため tenant_id が必要。
 *
 * レスポンス:
 *   { status: "pending" | "paid" | "expired" | "cancelled" }
 */
export async function GET(req: NextRequest) {
  const { client, accessToken } = createMobileClient(req);
  if (!client) {
    return apiUnauthorized();
  }

  const caller = await resolveMobileCaller(client, accessToken);
  if (!caller) {
    return apiUnauthorized();
  }

  if (!requireMinRole(caller, "staff")) {
    return apiForbidden();
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return apiValidationError("session_id required");
  }

  // tenant_id はクエリパラメータから取得（なければ caller のテナントを使用）
  const tenantId = req.nextUrl.searchParams.get("tenant_id") ?? caller.tenantId;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return apiInternalError(new Error("stripe not configured"), "mobile/pos/qr-status");
  }

  // テナントの Connect アカウントを取得（セッション参照に必要）
  const { admin } = createTenantScopedAdmin(caller.tenantId);
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", tenantId)
    .single();

  const connectAccountId = tenantRow?.stripe_connect_onboarded
    ? (tenantRow.stripe_connect_account_id as string | null)
    : null;

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });

  const stripeOptions = connectAccountId ? { stripeAccount: connectAccountId } : undefined;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, stripeOptions);
  } catch {
    return apiNotFound("session not found");
  }

  // Stripe セッションのステータスを Ledra 用にマッピング
  // payment_status: "paid" | "unpaid" | "no_payment_required"
  // status: "open" | "complete" | "expired"
  let status: "pending" | "paid" | "expired" | "cancelled";

  if (session.payment_status === "paid" && session.status === "complete") {
    status = "paid";
  } else if (session.status === "expired") {
    status = "expired";
  } else {
    status = "pending";
  }

  return apiJson({
    status,
    payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    amount_total: session.amount_total,
  });
}
