/**
 * POST /api/webhooks/supply/[partnerId]
 * 供給パートナーの受注システムからの「受注確定 / 出荷 / 却下」通知 Webhook。
 *
 * 認証: パートナーの署名シークレット (supply_partner_credentials.webhook_secret) による
 *   HMAC-SHA256 署名 (X-Ledra-Signature: sha256=<hex>) を検証する。
 *
 * 効果: 該当発注 (supply_partner_id + po_number で一致) の transport_status /
 *   external_order_id を更新する。**PO の status (received 等) は変更しない**
 *   — 入荷の在庫計上は人の確認操作のまま (壁3)。
 *
 * 注: 署名検証のため生ボディを読む。鍵の復号・PO 更新は service-role で行う
 *   (呼び出し元は Supabase 未認証の外部システムのため)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { verifySupplyWebhookSignature } from "@/lib/supply/webhookSignature";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
  po_number: z.string().trim().min(1).max(60),
  external_order_id: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["accepted", "confirmed", "shipped", "rejected"]),
});

// パートナー通知ステータス → 内部 transport_status。
const STATUS_MAP: Record<string, "acked" | "failed"> = {
  accepted: "acked",
  confirmed: "acked",
  shipped: "acked",
  rejected: "failed",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ partnerId: string }> }) {
  try {
    const { partnerId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(partnerId)) return json(404, { ok: false, error: "not_found" });

    const rawBody = await req.text();

    const admin = createServiceRoleAdmin(
      "webhook:supply 受注確定 — 署名検証用シークレット復号 + 発注の transport 更新",
    );

    // パートナーの Webhook シークレットを復号して署名検証。
    const { data: cred } = await admin
      .from("supply_partner_credentials")
      .select("webhook_secret_ciphertext")
      .eq("supply_partner_id", partnerId)
      .maybeSingle();
    const secret = await readSecret(
      (cred?.webhook_secret_ciphertext as string | null) ?? null,
      "supply_partner_credentials.webhook_secret",
    );
    if (!secret) return json(404, { ok: false, error: "not_configured" });

    const signature = req.headers.get("x-ledra-signature");
    if (!verifySupplyWebhookSignature(rawBody, signature, secret)) {
      return json(401, { ok: false, error: "invalid_signature" });
    }

    // 署名検証後にパース。
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }
    const parsed = payloadSchema.safeParse(parsedJson);
    if (!parsed.success) return json(400, { ok: false, error: "invalid_payload" });
    const { po_number, external_order_id, status } = parsed.data;

    // 該当発注を特定 (このパートナー宛て + po_number)。partner が知り得る発注に限定される。
    const { data: po } = await admin
      .from("purchase_orders")
      .select("id, tenant_id")
      .eq("supply_partner_id", partnerId)
      .eq("po_number", po_number)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!po) return json(404, { ok: false, error: "order_not_found" });

    const update: Record<string, unknown> = { transport_status: STATUS_MAP[status] };
    if (external_order_id) update.external_order_id = external_order_id;

    const { error: upErr } = await admin.from("purchase_orders").update(update).eq("id", po.id);
    if (upErr) {
      logger.warn("[webhook:supply] update failed", { partnerId, poId: po.id, err: upErr.message });
      return json(500, { ok: false, error: "update_failed" });
    }

    logger.info("[webhook:supply] order confirmation", {
      partnerId,
      tenantId: po.tenant_id,
      poId: po.id,
      status,
    });
    return json(200, { ok: true });
  } catch (e) {
    logger.warn("[webhook:supply] threw", { err: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, error: "internal_error" });
  }
}
