/**
 * コーティング・PPF施工の消耗品トラッキング（部品交換基盤の再利用）。
 *
 * 設計: docs/coating-ppf-integrity-design.md
 *
 * コーティング剤・PPFフィルムは個体識別のない消耗品 (part_kind='consumable') なので、
 * 部品交換用に作った part_installations / 納品書OCR三方照合 / 写真重複検知をそのまま使う。
 * 新しいテーブルや現場作業は増やさない — 証明書作成時に自動で装着レコードを1件作るだけ。
 */

import { createInstallation } from "@/lib/parts/installationService";

export interface CoatingProductRow {
  location?: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  lot_number?: string | null;
}

export interface CoatingCertificateContext {
  certificateId: string;
  vehicleId: string | null;
  customerId: string | null;
}

/** 記録に値する行か（部位や製品情報が何もない空行は対象外）。 */
export function isTrackableCoatingRow(row: CoatingProductRow): boolean {
  return Boolean(row.product_name?.trim() || row.brand_name?.trim());
}

/** 装着レコードの部品名（製品名優先、無ければブランド名＋部位）。 */
export function coatingRowPartName(row: CoatingProductRow): string {
  const product = row.product_name?.trim();
  if (product) return product;
  const brand = row.brand_name?.trim() ?? "";
  const location = row.location?.trim() ?? "";
  return [brand, location].filter(Boolean).join(" ") || "コーティング剤";
}

/**
 * コーティング剤/PPFフィルムの各施工部位を part_installations に記録する。
 * ベストエフォート: 1行の失敗が証明書発行全体をブロックしないよう、呼び出し側で
 * try/catch すること（本関数自体は失敗を投げる）。
 */
export async function recordCoatingConsumableInstallations(
  tenantId: string,
  userId: string | null,
  ctx: CoatingCertificateContext,
  rows: CoatingProductRow[],
): Promise<number> {
  const trackable = rows.filter(isTrackableCoatingRow);
  let created = 0;
  for (const row of trackable) {
    await createInstallation(tenantId, userId, {
      certificate_id: ctx.certificateId,
      vehicle_id: ctx.vehicleId,
      customer_id: ctx.customerId,
      part_name: coatingRowPartName(row),
      lot_code: row.lot_number?.trim() || null,
      part_kind: "consumable",
      quantity: 1,
      unit: "件",
      evidence: [],
    });
    created += 1;
  }
  return created;
}
