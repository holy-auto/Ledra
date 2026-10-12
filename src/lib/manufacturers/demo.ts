// デモ用メーカー（supabase/migrations/20260514120000_demo_seed_manufacturer.sql・scripts/setup-demo-manufacturer.ts と同じ ID）。
// 商談用の見本（/manufacturer/report-samples）はこのメーカーのアカウントにだけ出す。
export const DEMO_MANUFACTURER_ID = "00000000-0000-0000-0000-de0000000200";

export const isDemoManufacturer = (manufacturerId: string | null | undefined) =>
  manufacturerId === DEMO_MANUFACTURER_ID;
