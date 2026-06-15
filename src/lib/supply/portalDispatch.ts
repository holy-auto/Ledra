/**
 * 発注を「ポータルに投函する」共通処理 — 手動送信 (admin route) と全自動送信 (cron) で共有。
 *
 * transport='portal' は Ledra ホストの受注ポータルにメーカーが取りに来るプル型。投函時は
 * partner_response='pending' (回答待ち) で sent にする。partner_response は guard トリガで
 * tenant/クライアント書込を差し戻すため、必ず service-role の admin クライアントで書く。
 */
import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/**
 * 発注をポータルに投函済み (sent / 回答待ち) として記録する。成功で true。
 * partner_response='pending'・transport='portal'・transport_status='sent'・sent_at を立てる。
 */
export async function markOrderDeliveredToPortal(admin: Admin, tenantId: string, poId: string): Promise<boolean> {
  const { error } = await admin
    .from("purchase_orders")
    .update({
      status: "sent",
      transport: "portal",
      transport_status: "sent",
      partner_response: "pending",
      sent_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("tenant_id", tenantId);
  if (error) {
    logger.warn("[portalDispatch] mark delivered failed", { tenantId, poId, err: error.message });
    return false;
  }
  return true;
}
