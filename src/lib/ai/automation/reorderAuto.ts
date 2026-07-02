/**
 * 在庫下限割れ時に発注書を draft として自動起票する IO 層。
 *
 * 日次 cron (`/api/cron/low-stock-alerts`) のテナントごとループから呼ばれる。
 * 絶対に throw しない (1 テナントの失敗で cron 全体を落とさない)。
 *
 * 段階:
 *   1. settings をロードし inventory.auto_draft_reorder が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_pos_deduction) と is_active を確認
 *   3. 低在庫 + 仕入先設定済みの品目を集め、仕入先ごとに発注書 (draft/auto) を起票
 *
 * 壁3: 作るのは **draft のみ**。発注の承認・送信 (仕入先への金額コミット) は必ず人。
 * 冪等性: 部分 UNIQUE インデックス uq_po_auto_open_per_supplier により、
 * 1 仕入先につき同時に存在する auto 下書きは 1 つに制限される (重複起票しない)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { computeReorderGroups, type ReorderableItem } from "@/lib/inventory/reorder";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoDraftReorder } from "./orchestrator";

export interface MaybeAutoDraftReordersResult {
  created: number;
  skipped: number;
}

/** 発注番号を生成 (PO-YYYYMMDD-XXXX)。衝突は実用上問題ない簡易採番。 */
function makePoNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PO-${ymd}-${suffix}`;
}

function isUniqueViolation(err: { code?: string } | null | undefined): boolean {
  return err?.code === "23505";
}

function isMissingTableOrColumn(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(err.code ?? "")) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * テナントの低在庫品目から発注書ドラフトを自動起票する。失敗しても投げない。
 */
export async function maybeAutoDraftReordersForTenant(tenantId: string): Promise<MaybeAutoDraftReordersResult> {
  const result: MaybeAutoDraftReordersResult = { created: 0, skipped: 0 };
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDraftReorder(settings)) return result;

    const admin = createServiceRoleAdmin("AI auto-draft reorder — low-stock cron, fire-and-forget per tenant");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return result;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_pos_deduction")) return result;

    // 低在庫 + 仕入先設定済みの品目。supplier_id 列が無い環境では何もしない。
    const sel = await admin
      .from("inventory_items")
      .select("id, name, sku, supplier_id, current_stock, min_stock, reorder_qty, unit_cost")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .not("supplier_id", "is", null)
      .gt("min_stock", 0);
    if (sel.error) {
      if (!isMissingTableOrColumn(sel.error)) {
        logger.warn("[reorderAuto] inventory select failed", { tenantId, err: sel.error.message });
      }
      return result;
    }

    const items: ReorderableItem[] = (sel.data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sku: (r.sku as string | null) ?? null,
      supplier_id: (r.supplier_id as string | null) ?? null,
      current_stock: Number(r.current_stock),
      min_stock: Number(r.min_stock),
      reorder_qty: r.reorder_qty != null ? Number(r.reorder_qty) : null,
      unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    }));

    const groups = computeReorderGroups(items);
    if (groups.length === 0) return result;

    for (const group of groups) {
      // 発注書 (draft/auto) を起票。仕入先ごとに 1 つ。
      const { data: po, error: poErr } = await admin
        .from("purchase_orders")
        .insert({
          tenant_id: tenantId,
          supplier_id: group.supplier_id,
          po_number: makePoNumber(),
          status: "draft",
          source: "auto",
          subtotal: group.subtotal,
          note: "在庫下限割れにより自動作成された発注ドラフトです。内容を確認して承認・送信してください。",
          created_by: null,
        })
        .select("id")
        .single();

      if (poErr) {
        // 既に同仕入先の auto 下書きがある (UNIQUE) → スキップ。
        if (isUniqueViolation(poErr)) {
          result.skipped += 1;
          continue;
        }
        if (isMissingTableOrColumn(poErr)) return result; // テーブル未作成環境
        logger.warn("[reorderAuto] PO insert failed", { tenantId, supplierId: group.supplier_id, err: poErr.message });
        continue;
      }
      if (!po) continue;

      const itemRows = group.lines.map((l) => ({
        tenant_id: tenantId,
        po_id: po.id,
        item_id: l.item_id,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        amount: l.amount,
      }));
      const { error: itemErr } = await admin.from("purchase_order_items").insert(itemRows);
      if (itemErr) {
        logger.warn("[reorderAuto] PO items insert failed", { tenantId, poId: po.id, err: itemErr.message });
        // 明細が入らなかった空の発注は消しておく (中途半端な draft を残さない)。
        await admin.from("purchase_orders").delete().eq("id", po.id).eq("tenant_id", tenantId);
        continue;
      }
      result.created += 1;
      // 人の確認なしで発注書ドラフトを自動起票した事実を監査ログに残す (失敗しても起票は成立)。
      await logAutoActionExecuted({
        tenantId,
        actionKey: "purchase_order.auto_draft_on_low_stock",
        resource: { kind: "purchase_order", id: po.id },
        detail: { supplier_id: group.supplier_id, line_count: group.lines.length, subtotal: group.subtotal },
      });
    }

    return result;
  } catch (e) {
    logger.warn("[reorderAuto] maybeAutoDraftReordersForTenant threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return result;
  }
}
