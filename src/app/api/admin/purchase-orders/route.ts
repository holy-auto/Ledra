/**
 * 発注 (purchase order) の一覧 / 手動作成 / ステータス遷移。
 *
 * ステータス: draft → approved → sent → received (/ cancelled)
 *   - draft:    下書き (auto-action `inventory.auto_draft_reorder` が自動起票するのはここ)
 *   - approved: 人が内容を承認
 *   - sent:     仕入先へ発注送信 (メールがあれば送付) ← **外部コミットは必ず人** (壁3)
 *   - received: 入荷。明細の数量を在庫に in 計上する
 *   - cancelled:取消
 *
 * 自動化が触るのは draft の起票だけ。approve / send / receive は本ルート (人の操作)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";
import { sendEmail } from "@/lib/email/sendEmail";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { placeOrderViaApi, type SupplyAuthType } from "@/lib/supply/placeOrder";
import { markOrderDeliveredToPortal } from "@/lib/supply/portalDispatch";
import { notifyPartnerNewPortalOrder } from "@/lib/supply/portalNotify";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(80).nullable().optional(),
  quantity: z.coerce.number().positive(),
  unit_cost: z.coerce.number().int().min(0).nullable().optional(),
});

const createSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z.array(lineSchema).min(1, "発注明細は1件以上必要です。").max(200),
});

const STATUSES = ["draft", "approved", "sent", "received", "cancelled"] as const;
const updateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  status: z.enum(STATUSES),
  // sent 遷移時、人がレビューした発注メール文面 (AI 下書きを編集したもの) を渡せる。
  // メール送付経路でのみ使用 (API 発注は構造化ペイロードのため不使用)。
  message: z
    .object({
      subject: z.string().trim().max(200).optional(),
      body: z.string().trim().max(5000).optional(),
    })
    .optional(),
});

/** 許可するステータス遷移。 */
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["approved", "sent", "cancelled"]),
  approved: new Set(["sent", "cancelled"]),
  sent: new Set(["received", "cancelled"]),
  received: new Set([]),
  cancelled: new Set([]),
};

function makePoNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `PO-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ─── GET: 発注一覧 (明細つき) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = supabase
      .from("purchase_orders")
      .select(
        "id, supplier_id, supply_partner_id, po_number, status, source, note, subtotal, transport, transport_status, partner_response, partner_responded_at, partner_ship_eta, partner_tracking_no, decline_reason, approved_at, sent_at, received_at, created_at, suppliers(name), purchase_order_items(id, item_id, name, sku, quantity, unit_cost, amount, received, accepted_quantity, backorder_quantity)",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });
    if (status && (STATUSES as readonly string[]).includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "purchase orders list");
    return apiJson({ ok: true, purchase_orders: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "purchase orders list");
  }
}

// ─── POST: 手動で発注を作成 (draft) ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "purchase_order_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const input = parsed.data;

    const lines = input.items.map((l) => {
      const unitCost = l.unit_cost ?? null;
      const amount = unitCost != null ? Math.round(unitCost * l.quantity) : 0;
      return { ...l, unit_cost: unitCost, amount };
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: caller.tenantId,
        supplier_id: input.supplier_id ?? null,
        po_number: makePoNumber(),
        status: "draft",
        source: "manual",
        note: input.note ?? null,
        subtotal,
        created_by: caller.userId,
      })
      .select("id")
      .single();
    if (poErr || !po) return apiInternalError(poErr, "purchase order create");

    const itemRows = lines.map((l) => ({
      tenant_id: caller.tenantId,
      po_id: po.id,
      item_id: l.item_id ?? null,
      name: l.name,
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      amount: l.amount,
    }));
    const { error: itemErr } = await supabase.from("purchase_order_items").insert(itemRows);
    if (itemErr) {
      await supabase.from("purchase_orders").delete().eq("id", po.id).eq("tenant_id", caller.tenantId);
      return apiInternalError(itemErr, "purchase order items create");
    }

    return apiJson({ ok: true, id: po.id });
  } catch (e: unknown) {
    return apiInternalError(e, "purchase order create");
  }
}

// ─── PUT: ステータス遷移 (承認 / 送信 / 入荷 / 取消) ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { id, status: nextStatus, message } = parsed.data;

    // 現在の発注 + 明細 + 仕入先を取得 (所有チェック込み)。
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select(
        "id, status, supplier_id, supply_partner_id, po_number, subtotal, note, purchase_order_items(id, item_id, name, sku, quantity, unit_cost, accepted_quantity)",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (poErr) return apiInternalError(poErr, "purchase order fetch");
    if (!po) return apiNotFound("purchase order not found");

    const current = po.status as string;
    if (current === nextStatus) return apiJson({ ok: true, status: current });
    if (!ALLOWED_TRANSITIONS[current]?.has(nextStatus)) {
      return apiValidationError(`「${current}」から「${nextStatus}」へは変更できません。`);
    }

    const updates: Record<string, unknown> = { status: nextStatus };
    const nowIso = new Date().toISOString();
    if (nextStatus === "approved") {
      updates.approved_by = caller.userId;
      updates.approved_at = nowIso;
    }
    if (nextStatus === "sent") {
      updates.sent_at = nowIso;
    }
    if (nextStatus === "received") {
      updates.received_at = nowIso;
    }

    const { error: upErr } = await supabase
      .from("purchase_orders")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (upErr) return apiInternalError(upErr, "purchase order update");

    const items = (po.purchase_order_items ?? []) as Array<{
      id: string;
      item_id: string | null;
      name: string;
      sku: string | null;
      quantity: number;
      unit_cost: number | null;
      accepted_quantity: number | null;
    }>;

    let emailed = false;
    let transport: "api" | "email" | "portal" | null = null;
    let externalOrderId: string | null = null;
    // 送信 (外部コミット = 人の操作で初めて起きる)。
    //  - 店舗ローカル仕入先 (supplier_id): メール送付。
    //  - 供給パートナー (supply_partner_id): API があれば API 発注、無ければ連絡先メール。
    if (nextStatus === "sent") {
      const poForSend = {
        poNumber: (po.po_number as string | null) ?? id,
        note: (po.note as string | null) ?? null,
        subtotal: Number(po.subtotal ?? 0),
        items,
        // 人がレビューした発注文面 (AI 下書きを編集したもの)。メール経路でのみ使う。
        message: message ?? null,
      };
      if (po.supplier_id) {
        emailed = await sendPurchaseOrderEmail(supabase, caller.tenantId, po.supplier_id as string, poForSend);
        transport = emailed ? "email" : null;
      } else if (po.supply_partner_id) {
        const r = await dispatchSupplyPartnerOrder(
          supabase,
          caller.tenantId,
          po.supply_partner_id as string,
          id,
          poForSend,
        );
        transport = r.transport;
        externalOrderId = r.externalOrderId;
        emailed = r.transport === "email" && r.ok;
      }

      // 搬送結果を発注書に記録 (API 注文番号・搬送ステータス)。
      // portal は markOrderDeliveredToPortal が transport/partner_response を確定済みのため
      // ここでの上書きは整合する値 (transport='portal' / transport_status='sent')。
      const transportStatus = transport === "api" ? "acked" : transport ? "sent" : "failed";
      await supabase
        .from("purchase_orders")
        .update({
          transport,
          transport_status: transportStatus,
          external_order_id: externalOrderId,
        })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
    }

    // 入荷: 明細の数量を在庫に in 計上する。
    let stockedIn = 0;
    if (nextStatus === "received") {
      for (const it of items) {
        if (!it.item_id) continue;
        // ポータルで一部欠品の回答があった場合は実際に受注された数量を在庫計上する
        // (accepted_quantity が null の通常発注は発注数量どおり)。
        const inQty = it.accepted_quantity != null ? Number(it.accepted_quantity) : Number(it.quantity);
        if (!(inQty > 0)) continue;
        const { error: mvErr } = await supabase.rpc("apply_inventory_movement", {
          p_tenant_id: caller.tenantId,
          p_item_id: it.item_id,
          p_type: "in",
          p_quantity: inQty,
          p_reason: `発注入荷 (${(po.po_number as string | null) ?? id})`,
          p_reservation_id: null,
          p_created_by: caller.userId,
        });
        if (mvErr) {
          logger.warn("[purchase-orders] stock-in failed", {
            tenantId: caller.tenantId,
            itemId: it.item_id,
            err: mvErr.message,
          });
          continue;
        }
        stockedIn += 1;
      }
      await supabase
        .from("purchase_order_items")
        .update({ received: true })
        .eq("po_id", id)
        .eq("tenant_id", caller.tenantId);
    }

    return apiJson({
      ok: true,
      status: nextStatus,
      emailed,
      transport,
      external_order_id: externalOrderId,
      stocked_in: stockedIn,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "purchase order update");
  }
}

interface PoForSend {
  poNumber: string;
  note: string | null;
  subtotal: number;
  items: Array<{ name: string; sku: string | null; quantity: number; unit_cost: number | null }>;
  /** 人がレビューした発注文面 (AI 下書きを編集したもの)。メール送付経路で本文に使う。 */
  message?: { subject?: string; body?: string } | null;
}

/**
 * 供給パートナーへ実発注を搬送する。API 設定があれば API 発注、無ければ連絡先メール。
 * 鍵 (owner 専用 RLS) の復号と送信はサーバ側 (platform スコープ) が代行する。
 * 自店が提携 (tenant_supply_links) しているパートナーに限る。
 */
async function dispatchSupplyPartnerOrder(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  supplyPartnerId: string,
  poId: string,
  po: PoForSend,
): Promise<{ transport: "api" | "email" | "portal" | null; externalOrderId: string | null; ok: boolean }> {
  try {
    // 自店が提携済みか (RLS スコープの SSR クライアントで確認)。
    const { data: link } = await supabase
      .from("tenant_supply_links")
      .select("supply_partner_id")
      .eq("tenant_id", tenantId)
      .eq("supply_partner_id", supplyPartnerId)
      .maybeSingle();
    if (!link) return { transport: null, externalOrderId: null, ok: false };

    // パートナー情報 + 鍵は owner 専用 RLS のため platform スコープで読む。
    const admin = createPlatformScopedAdmin(
      "purchase-orders: 提携済み供給パートナーへの実発注搬送 (鍵復号 + API/ポータル/メール送信)",
    );
    const { data: partner } = await admin
      .from("supply_partners")
      .select("name, contact_email, api_endpoint, api_auth_type, api_config, portal_enabled, line_user_id")
      .eq("id", supplyPartnerId)
      .maybeSingle();
    if (!partner) return { transport: null, externalOrderId: null, ok: false };

    const authType = (partner.api_auth_type as SupplyAuthType | null) ?? "none";

    // API 連携がある場合は API 発注を試みる。
    if (authType !== "none" && partner.api_endpoint) {
      const { data: cred } = await admin
        .from("supply_partner_credentials")
        .select("api_key_ciphertext")
        .eq("supply_partner_id", supplyPartnerId)
        .maybeSingle();
      const apiKey = await readSecret(
        (cred?.api_key_ciphertext as string | null) ?? null,
        "supply_partner_credentials.api_key",
      );
      if (apiKey) {
        const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
        const shopName = (tenant?.name as string | null) ?? "当店";
        const result = await placeOrderViaApi(
          supplyPartnerId,
          {
            endpoint: partner.api_endpoint as string,
            authType,
            apiKey,
            config: partner.api_config as Record<string, unknown> | null,
          },
          { poNumber: po.poNumber, shopName, items: po.items, subtotal: po.subtotal, note: po.note },
        );
        if (result.ok) {
          return { transport: "api", externalOrderId: result.externalOrderId, ok: true };
        }
        logger.warn("[purchase-orders] supply partner API order failed, falling back to portal/email", {
          tenantId,
          supplyPartnerId,
          err: result.error,
        });
      }
    }

    // API が無い / 失敗した場合、ポータル連携が有効ならポータルに投函する。
    // メーカーが受信トレイで受注/欠品/辞退を回答できる (メールの送りっぱなしより上位)。
    if (partner.portal_enabled === true) {
      const delivered = await markOrderDeliveredToPortal(admin, tenantId, poId);
      if (delivered) {
        const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
        await notifyPartnerNewPortalOrder(
          {
            partnerName: (partner.name as string | null) ?? null,
            email: (partner.contact_email as string | null) ?? null,
            lineUserId: (partner.line_user_id as string | null) ?? null,
          },
          { shopName: (tenant?.name as string | null) ?? "当店", poNumber: po.poNumber },
        );
        return { transport: "portal", externalOrderId: null, ok: true };
      }
      logger.warn("[purchase-orders] portal delivery failed, falling back to email", { tenantId, supplyPartnerId });
    }

    // フォールバック: 連絡先メール。
    const email = (partner.contact_email as string | null) ?? null;
    if (!email) return { transport: null, externalOrderId: null, ok: false };
    const sent = await sendPoEmail(supabase, tenantId, (partner.name as string | null) ?? "ご担当者", email, po);
    return { transport: sent ? "email" : null, externalOrderId: null, ok: sent };
  } catch (e) {
    logger.warn("[purchase-orders] dispatchSupplyPartnerOrder threw", {
      tenantId,
      supplyPartnerId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { transport: null, externalOrderId: null, ok: false };
  }
}

/** 仕入先へ発注メールを送る。失敗しても false を返すだけ (送信自体は人の操作)。 */
async function sendPurchaseOrderEmail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  supplierId: string,
  po: PoForSend,
): Promise<boolean> {
  try {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name, email")
      .eq("id", supplierId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const email = (supplier?.email as string | null) ?? null;
    if (!email) return false;
    return sendPoEmail(supabase, tenantId, (supplier?.name as string | null) ?? "ご担当者", email, po);
  } catch (e) {
    logger.warn("[purchase-orders] supplier email failed", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/** 宛先 (名前 + メール) を直接受け取り発注メールを送る。仕入先/供給パートナー双方から再利用。 */
async function sendPoEmail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  recipientName: string,
  recipientEmail: string,
  po: PoForSend,
): Promise<boolean> {
  try {
    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const shopName = (tenant?.name as string | null) ?? "施工店";

    // 人がレビューした文面 (AI 下書き) があればそれを本文にする (改行を保持して HTML 化)。
    // 数量・金額は発注書側で固定されており、文面は宛名・依頼文のみ (壁3)。
    const customBody = po.message?.body?.trim();
    if (customBody) {
      const html = `<div style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(customBody)}</div>`;
      const res = await sendEmail({
        to: recipientEmail,
        subject: po.message?.subject?.trim() || `【発注】${shopName} (${po.poNumber})`,
        html,
      });
      return res.ok;
    }

    const rows = po.items
      .map(
        (l) =>
          `<tr><td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(l.name)}</td>` +
          `<td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(l.sku ?? "")}</td>` +
          `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${l.quantity}</td>` +
          `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${l.unit_cost != null ? "¥" + l.unit_cost.toLocaleString("ja-JP") : "—"}</td></tr>`,
      )
      .join("");

    const html = `
      <p>${escapeHtml(recipientName)} 御中</p>
      <p>${escapeHtml(shopName)} です。下記の通り発注いたします。</p>
      <p>発注番号: <b>${escapeHtml(po.poNumber)}</b></p>
      <table style="border-collapse:collapse">
        <thead><tr>
          <th style="padding:4px 8px;border:1px solid #ddd">品目</th>
          <th style="padding:4px 8px;border:1px solid #ddd">品番</th>
          <th style="padding:4px 8px;border:1px solid #ddd">数量</th>
          <th style="padding:4px 8px;border:1px solid #ddd">単価</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>概算合計: ¥${po.subtotal.toLocaleString("ja-JP")}</p>
      ${po.note ? `<p>備考: ${escapeHtml(po.note)}</p>` : ""}
    `.trim();

    const res = await sendEmail({
      to: recipientEmail,
      subject: `【発注】${shopName} (${po.poNumber})`,
      html,
    });
    return res.ok;
  } catch (e) {
    logger.warn("[purchase-orders] PO email failed", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function escapeHtml(s: string | null): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
