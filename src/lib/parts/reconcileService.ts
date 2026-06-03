/**
 * 三方照合・数量突合のオーケストレーション（L3 のDB配線）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L3
 *
 * 装着レコードを読み、納品書OCR明細（と任意の請求明細）を
 * reconciliation.ts の純関数で突合し、不一致を part_integrity_findings に記録する。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  threeWayMatch,
  reconcileQuantity,
  type LineItem,
  type ReconciliationFinding,
} from "@/lib/parts/reconciliation";

/** 装着レコードの照合キー: GTIN を優先、無ければ品名（小文字化）。 */
export function installationMatchKey(gtin: string | null, partName: string): string {
  return (gtin?.trim() || partName?.trim() || "").toLowerCase();
}

export async function reconcileInstallation(
  tenantId: string,
  installationId: string,
  deliveryLines: LineItem[],
  billedLines: LineItem[] = [],
): Promise<ReconciliationFinding[]> {
  const { admin } = createTenantScopedAdmin(tenantId);

  const { data: inst, error } = await admin
    .from("part_installations")
    .select("id, tenant_id, gtin, part_name, quantity, amount_jpy, status")
    .eq("id", installationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`installation load failed: ${error.message}`);
  if (!inst) throw new Error("installation not found");

  const key = installationMatchKey(inst.gtin, inst.part_name);
  const installed: LineItem = { key, quantity: inst.quantity, amountJpy: inst.amount_jpy };

  const delivered = deliveryLines.find((l) => l.key === key);
  const billed = billedLines.find((l) => l.key === key);

  const findings: ReconciliationFinding[] = [
    ...threeWayMatch({ installed, deliveryLines, billedLines }),
    ...reconcileQuantity({
      key,
      deliveredQty: delivered?.quantity ?? null,
      installedQty: inst.quantity,
      billedQty: billed?.quantity ?? null,
    }),
  ];

  if (findings.length > 0) {
    const { error: fErr } = await admin.from("part_integrity_findings").insert(
      findings.map((f) => ({
        tenant_id: tenantId,
        installation_id: installationId,
        rule: f.rule,
        severity: f.severity,
        detail: f.detail,
      })),
    );
    if (fErr) throw new Error(`findings insert failed: ${fErr.message}`);
  }

  return findings;
}
