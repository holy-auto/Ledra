/**
 * 他テナントに見せてよい market_vehicles の列（/market の一覧・詳細）。
 *
 * 他テナントの出品中の車両は service role で読む（RLS は自テナントの行しか通さない。
 * マイグレーション 20261017103611）。service role は列を絞らないので、ここに無い列は他テナントへ出ない。
 * 仕入原価・仕入先・仕入日・成約・買主情報・車台番号・ナンバー・店舗は**足さないこと**
 * （__tests__/listingColumns.test.ts が見ている）。
 */
export const MARKET_LISTING_COLUMNS =
  "id, tenant_id, maker, model, grade, year, mileage, color, color_code, engine_type, displacement, transmission, drive_type, fuel_type, door_count, seating_capacity, body_type, inspection_date, repair_history, condition_grade, condition_note, asking_price, wholesale_price, status, listed_at, description, features, created_at, updated_at";
