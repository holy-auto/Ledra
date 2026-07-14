/**
 * 車検証 OCR 結果 (ShakenshoData) から車両レコードを作成する — IO 層。
 *
 * `/api/vehicles/create` (管理画面・要セッション) と `/api/vehicles/parse-shakken`
 * の組み立てロジックを service-role 文脈向けに再構成したもの。webhook (LINE) には
 * ユーザーセッションが無いため、この専用関数で直接 insert する。
 */
import type { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { calcSizeClass, extractFirstRegistrationYear, type ShakenshoData } from "@/lib/ocr/shakensho";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface CreateVehicleFromShakenshoParams {
  tenantId: string;
  customerId: string;
  data: ShakenshoData;
}

/**
 * 車検証 OCR 結果から車両を作成する。`maker` が読めなければ (誤登録を避けるため)
 * 作成せず null を返す — 呼び出し側はスタッフ引き継ぎにフォールバックする。
 */
export async function createVehicleFromShakensho(
  admin: Admin,
  params: CreateVehicleFromShakenshoParams,
): Promise<string | null> {
  const { tenantId, customerId, data } = params;
  const maker = data.maker?.trim();
  if (!maker) return null;
  // vehicleCreateSchema と同じ必須項目 (maker, model)。車種が読めない場合は
  // 空欄のまま作らず「不明」で登録する (OCR 精度が低い車検証でも登録自体は続けられる
  // ようにし、詳細はスタッフに確認してもらう)。
  const model = data.model?.trim() || "不明";

  let sizeClass: string | null = null;
  if (data.length_mm && data.width_mm && data.height_mm) {
    sizeClass = calcSizeClass(data.length_mm, data.width_mm, data.height_mm);
  }
  if (!sizeClass) {
    const { data: sizeRow } = await admin
      .from("vehicle_size_master")
      .select("size_class")
      .eq("maker", maker)
      .eq("model", model)
      .limit(1)
      .maybeSingle();
    sizeClass = (sizeRow as { size_class?: string } | null)?.size_class ?? null;
  }

  const insertRow = {
    tenant_id: tenantId,
    customer_id: customerId,
    maker,
    model,
    year: extractFirstRegistrationYear(data.first_registration),
    plate_display: data.plate_display?.trim() || null,
    vin_code: data.vin?.trim() || null,
    size_class: sizeClass,
    inspection_expiry_date: data.expiry_date ?? null,
    notes: "LINE で送付された車検証の写真から自動登録しました。内容をご確認ください。",
  };

  const { data: vehicle, error } = await admin.from("vehicles").insert(insertRow).select("id").single();
  if (error) {
    logger.warn("[createVehicleFromShakensho] insert failed", { tenantId, err: error.message });
    return null;
  }

  await emitEntityWebhook(tenantId, "vehicle.created", vehicle.id, {
    id: vehicle.id,
    maker: insertRow.maker,
    model: insertRow.model,
    plate_display: insertRow.plate_display,
    vin_code: insertRow.vin_code,
    customer_id: insertRow.customer_id,
  });

  return vehicle.id as string;
}
