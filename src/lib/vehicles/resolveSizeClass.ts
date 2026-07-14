/**
 * 車両のサイズクラスを決定する — 寸法があればそこから直接算出、無ければ
 * `vehicle_size_master` (メーカー+車種) から引く。管理画面の手動登録
 * (/api/vehicles/create) と LINE 車検証撮影の自動登録 (createFromShakensho.ts)
 * の両方で使う共通ロジック。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcSizeClass } from "@/lib/ocr/shakensho";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function resolveVehicleSizeClass(
  db: Db,
  params: {
    maker: string;
    model: string;
    lengthMm?: number | null;
    widthMm?: number | null;
    heightMm?: number | null;
  },
): Promise<string | null> {
  const { maker, model, lengthMm, widthMm, heightMm } = params;
  if (lengthMm && widthMm && heightMm) {
    const bySize = calcSizeClass(lengthMm, widthMm, heightMm);
    if (bySize) return bySize;
  }
  const { data } = await db
    .from("vehicle_size_master")
    .select("size_class")
    .eq("maker", maker)
    .eq("model", model)
    .limit(1)
    .maybeSingle();
  return (data as { size_class?: string } | null)?.size_class ?? null;
}
