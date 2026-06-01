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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";
import { sendEmail } from "@/lib/email/sendEmail";
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
        "id, supplier_id, supply_partner_id, po_number, status, source, note, subtotal, transport, transport_status, approved_at, sent_at, received_at, created_at, suppliers(name), purchase_order_items(id, item_id, name, sku, quantity, unit_cost, amount, received)",
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

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { id, status: nextStatus } = parsed.data;

    // 現在の発注 + 明細 + 仕入先を取得 (所有チェック込み)。
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select(
        "id, status, supplier_id, po_number, subtotal, note, purchase_order_items(id, item_id, name, sku, quantity, unit_cost)",
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
    }>;

    let emailed = false;
    // 送信: 仕入先メールがあれば発注内容を送る (外部コミット = 人の操作で初めて起きる)。
    if (nextStatus === "sent" && po.supplier_id) {
      emailed = await sendPurchaseOrderEmail(supabase, caller.tenantId, po.supplier_id, {
        poNumber: (po.po_number as string | null) ?? id,
        note: (po.note as string | null) ?? null,
        subtotal: Number(po.subtotal ?? 0),
        items,
      });
    }

    // 入荷: 明細の数量を在庫に in 計上する。
    let stockedIn = 0;
    if (nextStatus === "received") {
      for (const it of items) {
        if (!it.item_id) continue;
        const { error: mvErr } = await supabase.rpc("apply_inventory_movement", {
          p_tenant_id: caller.tenantId,
          p_item_id: it.item_id,
          p_type: "in",
          p_quantity: it.quantity,
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

    return apiJson({ ok: true, status: nextStatus, emailed, stocked_in: stockedIn });
  } catch (e: unknown) {
    return apiInternalError(e, "purchase order update");
  }
}

/** 仕入先へ発注メールを送る。失敗しても false を返すだけ (送信自体は人の操作)。 */
async function sendPurchaseOrderEmail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  supplierId: string,
  po: {
    poNumber: string;
    note: string | null;
    subtotal: number;
    items: Array<{ name: string; sku: string | null; quantity: number; unit_cost: number | null }>;
  },
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

    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const shopName = (tenant?.name as string | null) ?? "施工店";

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
      <p>${escapeHtml((supplier?.name as string | null) ?? "ご担当者")} 御中</p>
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
      to: email,
      subject: `【発注】${shopName} (${po.poNumber})`,
      html,
    });
    return res.ok;
  } catch (e) {
    logger.warn("[purchase-orders] supplier email failed", {
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
