import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Square Webhook handler — receives order and payment event notifications.
 *
 * Events handled:
 *   - order.updated
 *   - payment.completed
 *
 * Setup:
 *   1. Register this URL in Square Developer Dashboard → Webhooks → Add Subscription
 *   2. Set SQUARE_WEBHOOK_SIGNATURE_KEY env var with the signature key from the subscription
 *
 * Square sends a `x-square-hmacsha256-signature` header with each request.
 * Verification: HMAC-SHA256(signature_key, notification_url + raw_body) → base64
 */

// ─── Signature verification ───

function verifySquareSignature(
  rawBody: string,
  signatureHeader: string,
  signatureKey: string,
  notificationUrl: string,
): boolean {
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signatureHeader, "utf8"),
  );
}

// ─── Event types ───

type SquareWebhookEvent = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  created_at?: string;
  data?: {
    type?: string;
    id?: string;
    object?: Record<string, unknown>;
  };
};

// ─── POST handler ───

export async function POST(req: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) {
    console.error("[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY not configured");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify signature
  const signature = req.headers.get("x-square-hmacsha256-signature");
  if (!signature) {
    console.warn("[square-webhook] Missing signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // The notification URL must match what was registered in Square Dashboard
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ??
    `${req.nextUrl.origin}/api/webhooks/square`;

  try {
    const valid = verifySquareSignature(rawBody, signature, signatureKey, notificationUrl);
    if (!valid) {
      console.warn("[square-webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch (err) {
    console.error("[square-webhook] Signature verification error:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse event
  let event: SquareWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, merchant_id: merchantId, data } = event;

  if (!type || !merchantId) {
    console.warn("[square-webhook] Missing type or merchant_id");
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  // Process events asynchronously — return 200 quickly to avoid Square retries
  // We use a fire-and-forget pattern here; errors are logged but not propagated
  processEvent(type, merchantId, data).catch((err) => {
    console.error("[square-webhook] Event processing error:", err);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── Event processing ───

async function processEvent(
  type: string,
  merchantId: string,
  data: SquareWebhookEvent["data"],
) {
  switch (type) {
    case "order.updated":
      await handleOrderUpdated(merchantId, data);
      break;
    case "payment.completed":
      await handlePaymentCompleted(merchantId, data);
      break;
    default:
      console.info(`[square-webhook] Unhandled event type: ${type}`);
  }
}

/**
 * Look up the tenant by square_merchant_id from square_connections.
 */
async function resolveTenant(merchantId: string) {
  const admin = getAdminClient();
  const { data: conn, error } = await admin
    .from("square_connections")
    .select("tenant_id, square_access_token, square_location_ids")
    .eq("square_merchant_id", merchantId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[square-webhook] tenant lookup error:", error.message);
    return null;
  }
  return conn;
}

/**
 * Handle order.updated — upsert the order into square_orders.
 */
async function handleOrderUpdated(
  merchantId: string,
  data: SquareWebhookEvent["data"],
) {
  const conn = await resolveTenant(merchantId);
  if (!conn) {
    console.warn(`[square-webhook] No active connection for merchant: ${merchantId}`);
    return;
  }

  const order = data?.object?.order_entry
    ? (data.object.order_entry as Record<string, unknown>)
    : (data?.object as Record<string, unknown> | undefined);

  // Square order.updated webhook only sends minimal data (order_id + location_id).
  // We need to fetch the full order from the API if we have enough info.
  const orderId = (order?.order_id as string) ?? (data?.id as string);
  if (!orderId) {
    console.warn("[square-webhook] order.updated missing order_id");
    return;
  }

  const admin = getAdminClient();
  const tenantId = conn.tenant_id as string;

  // Fetch the full order from Square API
  const accessToken = conn.square_access_token as string;
  const fullOrder = await fetchSquareOrder(accessToken, orderId);
  if (!fullOrder) {
    console.warn(`[square-webhook] Could not fetch order ${orderId} from Square API`);
    return;
  }

  await upsertOrder(admin, tenantId, fullOrder);
  console.info(`[square-webhook] order.updated processed: ${orderId} tenant: ${tenantId}`);
}

/**
 * Handle payment.completed — look up related order and upsert.
 */
async function handlePaymentCompleted(
  merchantId: string,
  data: SquareWebhookEvent["data"],
) {
  const conn = await resolveTenant(merchantId);
  if (!conn) {
    console.warn(`[square-webhook] No active connection for merchant: ${merchantId}`);
    return;
  }

  const payment = data?.object as Record<string, unknown> | undefined;
  const orderId = payment?.order_id as string | undefined;
  if (!orderId) {
    console.info("[square-webhook] payment.completed without order_id — skipping order upsert");
    return;
  }

  const admin = getAdminClient();
  const tenantId = conn.tenant_id as string;
  const accessToken = conn.square_access_token as string;

  const fullOrder = await fetchSquareOrder(accessToken, orderId);
  if (!fullOrder) {
    console.warn(`[square-webhook] Could not fetch order ${orderId} from Square API`);
    return;
  }

  await upsertOrder(admin, tenantId, fullOrder);
  console.info(`[square-webhook] payment.completed processed: order ${orderId} tenant: ${tenantId}`);
}

/**
 * Fetch a single order from Square Orders API.
 */
async function fetchSquareOrder(
  accessToken: string,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      console.error(`[square-webhook] Fetch order ${orderId} failed: ${res.status}`);
      return null;
    }

    const body = await res.json();
    return body.order ?? null;
  } catch (err) {
    console.error(`[square-webhook] Fetch order ${orderId} error:`, err);
    return null;
  }
}

/**
 * Upsert an order into square_orders (matching pattern from sync endpoint).
 */
async function upsertOrder(
  admin: ReturnType<typeof getAdminClient>,
  tenantId: string,
  order: Record<string, unknown>,
) {
  const orderId = order.id as string;
  const totalMoney = (order.total_money as any)?.amount ?? 0;
  const taxMoney = (order.total_tax_money as any)?.amount ?? 0;
  const discountMoney = (order.total_discount_money as any)?.amount ?? 0;
  const tipMoney = (order.total_tip_money as any)?.amount ?? 0;
  const netAmount = totalMoney - taxMoney;

  const tenders = (order.tenders ?? []) as any[];
  const paymentMethods: string[] = tenders.map((t: any) => t.type ?? "UNKNOWN");
  const receiptUrl = tenders.find((t: any) => t.receipt_url)?.receipt_url ?? null;

  const row = {
    tenant_id: tenantId,
    square_order_id: orderId,
    square_location_id: order.location_id as string,
    order_state: order.state as string,
    total_amount: totalMoney,
    tax_amount: taxMoney,
    discount_amount: discountMoney,
    tip_amount: tipMoney,
    net_amount: netAmount,
    currency: (order.total_money as any)?.currency ?? "JPY",
    payment_methods: paymentMethods,
    items_json: (order.line_items as any[]) ?? [],
    tenders_json: tenders,
    square_customer_id: (order.customer_id as string) ?? null,
    square_receipt_url: receiptUrl,
    square_created_at: order.created_at as string,
    square_closed_at: (order.closed_at as string) ?? null,
    raw_json: order,
  };

  // Check if order already exists
  const { data: existing } = await admin
    .from("square_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("square_order_id", orderId)
    .maybeSingle();

  if (existing) {
    // Update existing order
    const { error } = await admin
      .from("square_orders")
      .update({
        order_state: row.order_state,
        total_amount: row.total_amount,
        tax_amount: row.tax_amount,
        discount_amount: row.discount_amount,
        tip_amount: row.tip_amount,
        net_amount: row.net_amount,
        payment_methods: row.payment_methods,
        items_json: row.items_json,
        tenders_json: row.tenders_json,
        square_customer_id: row.square_customer_id,
        square_receipt_url: row.square_receipt_url,
        square_closed_at: row.square_closed_at,
        raw_json: row.raw_json,
        synced_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error(`[square-webhook] update order ${orderId} error:`, error.message);
    }
  } else {
    // Insert new order
    const { error } = await admin.from("square_orders").insert(row);
    if (error) {
      console.error(`[square-webhook] insert order ${orderId} error:`, error.message);
    }
  }
}
