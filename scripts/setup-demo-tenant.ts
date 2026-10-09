/**
 * setup-demo-tenant.ts
 *
 * デモ施工店テナント "Ledra Motors" をセットアップ（upsert）します。
 * マーケ素材の製品スクリーンショット撮影、パートナーデモ、新規メンバー研修に
 * 使うことを想定しています。
 *
 * 前提:
 *   - SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が env に設定されていること
 *
 * 実行:
 *   npx tsx scripts/setup-demo-tenant.ts
 *
 * 冪等性:
 *   - 既知の UUID/slug を再利用しているので、何度実行してもレコードは重複しない
 *   - 再実行すると、各レコードが最新のシード内容に更新される
 *
 * クリーンアップ:
 *   npx tsx scripts/setup-demo-tenant.ts --reset
 *
 * 撮影用（社内撮影・非公開の紹介動画のための特例。DECISION_LOG 2026-10-07）:
 *   npx tsx scripts/setup-demo-tenant.ts --filming          # ヒーロー車両にアンカー表示・パスポート・購入済みレポートを足す
 *   npx tsx scripts/setup-demo-tenant.ts --filming-cleanup  # 上記と、撮影中に作った証明書を消す
 */

import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { generateDemoPlaceholderJpeg } from "./demoPlaceholderImage";
// 書き込み先バケットは公開ページの読み取り (publicData.ts の getPublicUrl) と
// 同じ定数を使い、writer/reader がドリフトしないようにする。
import { CERTIFICATE_IMAGE_BUCKET } from "../src/lib/certificateImages/constants";
import { computeCertDigest } from "../src/lib/anchoring/certificateHashing";
import { buildCertMerkle } from "../src/lib/anchoring/certificateMerkle";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── 固定 ID（再実行しても同じレコードを上書き）─────────────
const TENANT_ID = "00000000-0000-0000-0000-de0000000010";
const TENANT_SLUG = "ledra-motors-demo";

// プレースホルダ画像のアップロード失敗枚数。>0 なら main 末尾で throw して
// 非ゼロ終了させる（緑の exit に 400 残存を埋もれさせない）。
let placeholderUploadFailures = 0;

function uuid(ns: string, n: number): string {
  // Derive a stable UUID-shaped identifier. Postgres validates the final
  // 12-char block as hex, so we sanitize non-hex chars in the namespace to
  // '0' — this keeps the uuid well-formed regardless of what label we
  // chose for the namespace.
  const hex = ns.replace(/[^0-9a-f]/gi, "0").padStart(4, "0").slice(0, 4);
  const idx = String(n).padStart(8, "0").slice(-8);
  return `00000000-0000-0000-0000-${hex}${idx}`;
}

// ─── Seed data ─────────────────────────────────────────────

const TENANT = {
  id: TENANT_ID,
  name: "Ledra Motors（デモ）",
  slug: TENANT_SLUG,
  plan_tier: "pro" as const,
  is_active: true,
  contact_email: "demo@ledra-motors.example",
  contact_phone: "03-0000-0000",
  address: "東京都港区南青山 0-0-0 Ledra ビル 1F",
  website_url: "https://demo.ledra.co.jp",
};

type Customer = {
  idn: number;
  name: string;
  name_kana: string;
  email: string;
  phone: string;
  postal_code: string;
  address: string;
  note?: string;
};

const CUSTOMERS: Customer[] = [
  { idn: 1, name: "山田 太郎",  name_kana: "ヤマダ タロウ",  email: "yamada@example.com",  phone: "090-1000-0001", postal_code: "150-0001", address: "東京都渋谷区神宮前 1-1-1", note: "リピーター、ガラスコーティング推し" },
  { idn: 2, name: "佐藤 花子",  name_kana: "サトウ ハナコ",  email: "sato@example.com",    phone: "090-1000-0002", postal_code: "106-0032", address: "東京都港区六本木 2-2-2" },
  { idn: 3, name: "鈴木 一郎",  name_kana: "スズキ イチロウ", email: "suzuki@example.com",  phone: "090-1000-0003", postal_code: "107-0052", address: "東京都港区赤坂 3-3-3", note: "社用車複数台を順次入庫予定" },
  { idn: 4, name: "高橋 由美",  name_kana: "タカハシ ユミ",  email: "takahashi@example.com", phone: "090-1000-0004", postal_code: "153-0061", address: "東京都目黒区中目黒 4-4-4" },
  { idn: 5, name: "田中 健二",  name_kana: "タナカ ケンジ",  email: "tanaka@example.com",  phone: "090-1000-0005", postal_code: "160-0022", address: "東京都新宿区新宿 5-5-5" },
  { idn: 6, name: "渡辺 美咲",  name_kana: "ワタナベ ミサキ", email: "watanabe@example.com", phone: "090-1000-0006", postal_code: "102-0093", address: "東京都千代田区平河町 6-6-6" },
  { idn: 7, name: "伊藤 裕介",  name_kana: "イトウ ユウスケ", email: "ito@example.com",     phone: "090-1000-0007", postal_code: "141-0022", address: "東京都品川区東五反田 7-7-7" },
  { idn: 8, name: "小林 あかね", name_kana: "コバヤシ アカネ", email: "kobayashi@example.com", phone: "090-1000-0008", postal_code: "158-0094", address: "東京都世田谷区玉川 8-8-8" },
  { idn: 9, name: "中村 翔太", name_kana: "ナカムラ ショウタ", email: "nakamura@example.com", phone: "090-1000-0009", postal_code: "145-0071", address: "東京都大田区田園調布 9-9-9", note: "新車から全記録を当店で管理（撮影用ヒーロー車両）" },
];

type Vehicle = {
  idn: number;
  customerIdn: number;
  maker: string;
  model: string;
  year: number;
  plate_display: string;
  vin_code?: string;
  notes?: string;
};

const VEHICLES: Vehicle[] = [
  { idn: 1,  customerIdn: 1, maker: "TOYOTA",  model: "クラウン 2.5 RS",        year: 2023, plate_display: "品川 330 あ 12-34" },
  { idn: 2,  customerIdn: 1, maker: "LEXUS",   model: "RX 500h F SPORT",       year: 2024, plate_display: "品川 330 あ 56-78", notes: "納車後すぐの施工依頼" },
  { idn: 3,  customerIdn: 2, maker: "HONDA",   model: "ステップワゴン e:HEV",   year: 2022, plate_display: "世田谷 500 は 34-56" },
  { idn: 4,  customerIdn: 3, maker: "NISSAN",  model: "セレナ e-POWER",        year: 2023, plate_display: "練馬 500 か 22-33" },
  { idn: 5,  customerIdn: 3, maker: "MAZDA",   model: "CX-60 XD L Package",    year: 2024, plate_display: "練馬 500 か 44-55" },
  { idn: 6,  customerIdn: 4, maker: "BMW",     model: "5シリーズ 523d",        year: 2021, plate_display: "足立 300 さ 11-22" },
  { idn: 7,  customerIdn: 5, maker: "SUBARU",  model: "レヴォーグ STI Sport",  year: 2024, plate_display: "多摩 300 さ 77-88", notes: "フロントのみガラスフィルム施工" },
  { idn: 8,  customerIdn: 6, maker: "TOYOTA",  model: "プリウス 2.0 Z",        year: 2023, plate_display: "品川 500 さ 66-77" },
  { idn: 9,  customerIdn: 7, maker: "MERCEDES", model: "GLA 200d",            year: 2022, plate_display: "港 300 さ 99-00" },
  { idn: 10, customerIdn: 8, maker: "LEXUS",   model: "NX 350h Version L",     year: 2024, plate_display: "品川 500 さ 88-99", notes: "セラミックコーティングご希望" },
  // 撮影用ヒーロー車両: 新車から3年半の施工・整備を1台に集約する (下の CERTS 17〜27)。
  // 車体番号は実在しない型式 "LDM80" にして、他テナントの実車と突合しないようにする。
  { idn: 11, customerIdn: 9, maker: "TOYOTA", model: "ハリアー ハイブリッド Z Leather Package", year: 2023, plate_display: "品川 300 な 20-23", vin_code: "LDM80-0012345", notes: "新車から全記録を当店で管理" },
];

type Cert = {
  idn: number;
  vehicleIdn: number;
  public_id: string;
  service_type: string;
  preset_title: string;
  preset_products?: string[];
  /** 省略時は施工日の年から `YYYY-LDM-<idn>` を作る */
  certificate_no?: string;
  status?: "active" | "void";
  daysAgo: number;
  /** 省略時は「〜を施工しました」の定型文 */
  free_text?: string;
  maintenance_json?: Record<string, unknown>;
  body_repair_json?: Record<string, unknown>;
};

const CERTS: Cert[] = [
  { idn: 1,  vehicleIdn: 1,  public_id: "LEDRA-DEMO-0001", service_type: "glass-coating",    preset_title: "プレミアムガラスコーティング",    preset_products: ["9H Premium", "ホイールガラスコート"],            certificate_no: "2026-LDM-0001", daysAgo: 86 },
  { idn: 2,  vehicleIdn: 2,  public_id: "LEDRA-DEMO-0002", service_type: "ceramic-coating",  preset_title: "セラミックコーティング（8層仕上げ）", preset_products: ["Ceramic Pro 9H", "Top Coat Light"],            certificate_no: "2026-LDM-0002", daysAgo: 72 },
  { idn: 3,  vehicleIdn: 3,  public_id: "LEDRA-DEMO-0003", service_type: "film-protection",  preset_title: "ヘッドライトプロテクション（PPF）", preset_products: ["XPEL Ultimate Plus"],                           certificate_no: "2026-LDM-0003", daysAgo: 65 },
  { idn: 4,  vehicleIdn: 4,  public_id: "LEDRA-DEMO-0004", service_type: "glass-coating",    preset_title: "撥水ガラスコーティング",          preset_products: ["Aqua Repel"],                                    certificate_no: "2026-LDM-0004", daysAgo: 58 },
  { idn: 5,  vehicleIdn: 5,  public_id: "LEDRA-DEMO-0005", service_type: "wrap-full",        preset_title: "フルラッピング（マットブラック）", preset_products: ["3M 2080 Matte Black"],                           certificate_no: "2026-LDM-0005", daysAgo: 52 },
  { idn: 6,  vehicleIdn: 6,  public_id: "LEDRA-DEMO-0006", service_type: "interior-care",    preset_title: "本革シートメンテナンス",          preset_products: ["Leather Balm"],                                 certificate_no: "2026-LDM-0006", daysAgo: 48 },
  { idn: 7,  vehicleIdn: 7,  public_id: "LEDRA-DEMO-0007", service_type: "film-window",      preset_title: "ウィンドウフィルム（IR-05 可視光）", preset_products: ["IKC IR-05"],                                    certificate_no: "2026-LDM-0007", daysAgo: 41 },
  { idn: 8,  vehicleIdn: 8,  public_id: "LEDRA-DEMO-0008", service_type: "glass-coating",    preset_title: "ガラスコーティング（スタンダード）", preset_products: ["9H Standard"],                                 certificate_no: "2026-LDM-0008", daysAgo: 34 },
  { idn: 9,  vehicleIdn: 9,  public_id: "LEDRA-DEMO-0009", service_type: "detailing",       preset_title: "ファインディティーリング",        preset_products: ["Clay Bar", "Polish Stage 1", "Finishing Wax"],  certificate_no: "2026-LDM-0009", daysAgo: 27 },
  { idn: 10, vehicleIdn: 10, public_id: "LEDRA-DEMO-0010", service_type: "ceramic-coating",  preset_title: "セラミックコーティング（5年保証）", preset_products: ["Ceramic Pro Sport"],                           certificate_no: "2026-LDM-0010", daysAgo: 21 },
  { idn: 11, vehicleIdn: 2,  public_id: "LEDRA-DEMO-0011", service_type: "glass-coating",    preset_title: "ボディガラスコーティング再施工", preset_products: ["9H Maintenance"],                                certificate_no: "2026-LDM-0011", daysAgo: 17 },
  { idn: 12, vehicleIdn: 5,  public_id: "LEDRA-DEMO-0012", service_type: "film-protection",  preset_title: "フロントバンパーPPF",           preset_products: ["SunTek Ultra"],                                  certificate_no: "2026-LDM-0012", daysAgo: 14 },
  { idn: 13, vehicleIdn: 1,  public_id: "LEDRA-DEMO-0013", service_type: "detailing",       preset_title: "ホイール脱着・内側コーティング",   preset_products: ["Wheel Ceramic"],                                certificate_no: "2026-LDM-0013", daysAgo: 10 },
  { idn: 14, vehicleIdn: 3,  public_id: "LEDRA-DEMO-0014", service_type: "interior-care",    preset_title: "ファブリックシートクリーニング", preset_products: ["Fabric Guard Pro"],                              certificate_no: "2026-LDM-0014", daysAgo: 6 },
  { idn: 15, vehicleIdn: 10, public_id: "LEDRA-DEMO-0015", service_type: "ceramic-coating",  preset_title: "ホイールセラミックコーティング", preset_products: ["Wheel Ceramic Pro"],                             certificate_no: "2026-LDM-0015", daysAgo: 2 },
  { idn: 16, vehicleIdn: 8,  public_id: "LEDRA-DEMO-0016", service_type: "glass-coating",    preset_title: "新車同時施工 ガラスコート",      preset_products: ["9H Premium", "Maintenance Kit"],                 certificate_no: "2026-LDM-0016", daysAgo: 1 },

  // ─── 撮影用ヒーロー車両 (vehicle 11) の履歴: 施工と整備を時系列で交互に ───
  { idn: 17, vehicleIdn: 11, public_id: "LEDRA-DEMO-0017", service_type: "coating",     preset_title: "新車ガラスコーティング",           preset_products: ["9H Premium", "ホイールガラスコート"], daysAgo: 1280 },
  { idn: 18, vehicleIdn: 11, public_id: "LEDRA-DEMO-0018", service_type: "ppf",         preset_title: "フロントプロテクションフィルム（PPF）", preset_products: ["XPEL Ultimate Plus"],                daysAgo: 1279 },
  { idn: 19, vehicleIdn: 11, public_id: "LEDRA-DEMO-0019", service_type: "maintenance", preset_title: "6ヶ月点検",                       preset_products: [], daysAgo: 1100,
    free_text: "6ヶ月点検を実施しました。異常なし。",
    maintenance_json: { work_types: ["periodic_inspection"], mileage: 4800, findings: "全項目異常なし。" } },
  { idn: 20, vehicleIdn: 11, public_id: "LEDRA-DEMO-0020", service_type: "maintenance", preset_title: "12ヶ月法定点検・オイル交換",       preset_products: ["エンジンオイル", "オイルフィルター"], daysAgo: 915,
    free_text: "12ヶ月法定点検とオイル交換を実施しました。",
    maintenance_json: { work_types: ["periodic_inspection", "oil_change"], mileage: 10900, parts_replaced: "エンジンオイル 0W-16 4.2L\nオイルフィルター", findings: "ブレーキパッド残量 フロント8mm / リア8mm。" } },
  { idn: 21, vehicleIdn: 11, public_id: "LEDRA-DEMO-0021", service_type: "coating",     preset_title: "ガラスコーティング 1年メンテナンス", preset_products: ["9H Maintenance"], daysAgo: 914 },
  { idn: 22, vehicleIdn: 11, public_id: "LEDRA-DEMO-0022", service_type: "body_repair", preset_title: "リアバンパー鈑金塗装",             preset_products: [], daysAgo: 700,
    free_text: "駐車場での接触によるリアバンパーの擦り傷を修理しました。",
    body_repair_json: { repair_type: "bankin_paint", affected_panels: ["rear_bumper"], repair_methods: ["filler_repair", "blend_paint"], paint_color_code: "218（アティチュードブラックマイカ）", paint_type: "pearl", before_notes: "右後方に約15cmの擦り傷と軽微な凹み。", after_notes: "パテ修正後ボカシ塗装。色差なし。" } },
  { idn: 23, vehicleIdn: 11, public_id: "LEDRA-DEMO-0023", service_type: "maintenance", preset_title: "24ヶ月法定点検",                   preset_products: ["ブレーキフルード", "ワイパーブレード"], daysAgo: 550,
    free_text: "24ヶ月法定点検を実施しました。",
    maintenance_json: { work_types: ["periodic_inspection", "wiper_replacement"], mileage: 21300, parts_replaced: "ブレーキフルード\nワイパーブレード（前）", findings: "ブレーキパッド残量 フロント6mm。次回車検時に交換を推奨。" } },
  { idn: 24, vehicleIdn: 11, public_id: "LEDRA-DEMO-0024", service_type: "coating",     preset_title: "ホイールセラミックコーティング",   preset_products: ["Wheel Ceramic Pro"], daysAgo: 400 },
  { idn: 25, vehicleIdn: 11, public_id: "LEDRA-DEMO-0025", service_type: "maintenance", preset_title: "初回車検（新車3年）",              preset_products: ["エンジンオイル", "ブレーキパッド", "補機バッテリー"], daysAgo: 185,
    free_text: "初回車検整備を実施しました。前回点検で推奨したブレーキパッドを交換。",
    maintenance_json: { work_types: ["vehicle_inspection", "oil_change", "brake_service", "battery_replacement"], mileage: 31800, parts_replaced: "エンジンオイル 0W-16 4.2L\nオイルフィルター\nブレーキパッド（フロント）\n補機バッテリー", findings: "ブレーキパッド フロント3mm → 新品交換。その他異常なし。" } },
  { idn: 26, vehicleIdn: 11, public_id: "LEDRA-DEMO-0026", service_type: "coating",     preset_title: "ガラスコーティング 3年目再施工",   preset_products: ["9H Premium"], daysAgo: 30 },
  { idn: 27, vehicleIdn: 11, public_id: "LEDRA-DEMO-0027", service_type: "maintenance", preset_title: "オイル交換・タイヤローテーション", preset_products: ["エンジンオイル"], daysAgo: 2,
    free_text: "オイル交換とタイヤローテーションを実施しました。",
    maintenance_json: { work_types: ["oil_change", "tire_change"], mileage: 34200, parts_replaced: "エンジンオイル 0W-16 4.2L", findings: "タイヤ残溝 5.5mm。偏摩耗なし。" } },
];

// ヒーロー車両の NFC タグ。最新の記録 (CERTS 27) に貼付済みとして紐づけ、
// /c/LEDRA-DEMO-0027 の「NFC情報」と管理画面タイムラインの「NFC書込」に出す。
// 実タグには https://app.ledra.co.jp/c/LEDRA-DEMO-0027 を書き込む。
const HERO_NFC = { idn: 1, vehicleIdn: 11, certIdn: 27, tag_code: "LDM-NFC-0001", uid: "04DE0000000001", daysAgo: 2 };

// ─── Reservations (予約 → 請求 導線デモ用) ───────────────────
// プレゼンで「予約 → 受付 → 作業 → 完了 → 請求」を一通り見せられるよう、各
// ステージの予約を用意する。status=completed の予約は下の INVOICES のソース。
type Resv = {
  idn: number;
  vehicleIdn: number;
  title: string;
  items: { name: string; price: number }[];
  status: "confirmed" | "arrived" | "in_progress" | "completed" | "cancelled";
  dayOffset: number; // scheduled_date: 負=過去 / 0=本日 / 正=未来
  start: string;
  end: string;
  note?: string;
  cancelReason?: string;
};

const RESERVATIONS: Resv[] = [
  { idn: 1, vehicleIdn: 1,  title: "プレミアムガラスコーティング", items: [{ name: "9H プレミアムガラスコーティング", price: 88000 }, { name: "ホイールガラスコート", price: 22000 }], status: "confirmed",  dayOffset: 3,  start: "10:00", end: "17:00", note: "リピーター。前回施工から半年。" },
  { idn: 2, vehicleIdn: 7,  title: "ウィンドウフィルム (IR-05)",   items: [{ name: "フロントウィンドウフィルム IR-05", price: 45000 }],                                                                status: "confirmed",  dayOffset: 1,  start: "13:00", end: "16:00" },
  { idn: 3, vehicleIdn: 3,  title: "ヘッドライトPPF",              items: [{ name: "ヘッドライト プロテクションフィルム", price: 38000 }],                                                              status: "arrived",    dayOffset: 0,  start: "09:30", end: "12:00", note: "受付済み・代車貸出あり。" },
  { idn: 4, vehicleIdn: 6,  title: "本革シートメンテナンス",        items: [{ name: "本革シートクリーニング+保護", price: 33000 }],                                                                    status: "in_progress", dayOffset: 0,  start: "10:00", end: "15:00", note: "作業中。" },
  { idn: 5, vehicleIdn: 10, title: "セラミックコーティング (5年保証)", items: [{ name: "Ceramic Pro Sport 5年保証", price: 165000 }],                                                                  status: "completed",  dayOffset: -2, start: "10:00", end: "18:00", note: "納車済み。請求書 入金済。" },
  { idn: 6, vehicleIdn: 9,  title: "ファインディテイリング",        items: [{ name: "粘土+ポリッシュ+コーティング", price: 49500 }],                                                                   status: "completed",  dayOffset: -5, start: "11:00", end: "17:00", note: "納車済み。請求書 送付済 (入金待ち)。" },
  { idn: 7, vehicleIdn: 4,  title: "撥水ガラスコーティング",        items: [{ name: "撥水ガラスコーティング", price: 55000 }],                                                                          status: "cancelled",  dayOffset: -1, start: "14:00", end: "17:00", cancelReason: "お客様都合により延期" },
];

// ─── Invoices (請求書: 下書き / 送付済 / 入金済) ──────────────
// 「予約 → 請求完了」の終端を見せるため、completed 予約に紐づく請求書を
// draft / sent / paid の各ステージで用意する。
type Inv = {
  idn: number;
  vehicleIdn: number;
  seq: number; // doc_number 連番
  items: { description: string; quantity: number; unit_price: number }[];
  status: "draft" | "sent" | "paid";
  issuedDaysAgo: number;
  dueInDays: number;
  paidDaysAgo?: number; // status=paid のとき入金日
};

const INVOICES: Inv[] = [
  // 予約5 (小林/NX セラミック) → 入金済
  { idn: 1, vehicleIdn: 10, seq: 1, items: [{ description: "Ceramic Pro Sport セラミックコーティング (5年保証)", quantity: 1, unit_price: 165000 }], status: "paid", issuedDaysAgo: 2, dueInDays: 28, paidDaysAgo: 1 },
  // 予約6 (伊藤/GLA ディテイリング) → 送付済 (入金待ち)
  { idn: 2, vehicleIdn: 9,  seq: 2, items: [{ description: "ファインディテイリング (粘土/ポリッシュ/コーティング)", quantity: 1, unit_price: 49500 }], status: "sent", issuedDaysAgo: 4, dueInDays: 26 },
  // 山田/クラウン 追加施工 → 下書き (これから送付)
  { idn: 3, vehicleIdn: 1,  seq: 3, items: [{ description: "ホイール脱着・内側コーティング", quantity: 1, unit_price: 28000 }, { description: "鉄粉除去", quantity: 1, unit_price: 8000 }], status: "draft", issuedDaysAgo: 0, dueInDays: 30 },
];

// ─── Helpers ──────────────────────────────────────────────

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** YYYY-MM-DD を返す。days 負=過去 / 0=本日 / 正=未来。 */
function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function upsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  opts: { typeColumn?: string } = {},
): Promise<void> {
  // Schema drift is common across Supabase projects (columns added / removed
  // by later migrations, or CHECK constraints narrower than the TS union).
  // Strategies, tried in order, up to 8 attempts:
  //   1) Strip columns the schema cache reports as missing (PGRST204)
  //   2) If a CHECK constraint fails and we know the type column, drop
  //      every row whose type value was implicated
  let current = rows as Record<string, unknown>[];
  const droppedCols = new Set<string>();
  const droppedTypes = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt++) {
    if (current.length === 0) {
      if (droppedCols.size > 0) {
        console.log(`  ℹ️ schema に無いカラムをスキップ: ${[...droppedCols].join(", ")}`);
      }
      if (droppedTypes.size > 0) {
        console.log(`  ℹ️ check 制約で許可されない type をスキップ: ${[...droppedTypes].join(", ")}`);
      }
      console.log(`  (全行がスキップされました)`);
      return;
    }
    const { error } = await admin.from(table).upsert(current, { onConflict });
    if (!error) {
      if (droppedCols.size > 0) {
        console.log(`  ℹ️ schema に無いカラムをスキップ: ${[...droppedCols].join(", ")}`);
      }
      if (droppedTypes.size > 0) {
        console.log(`  ℹ️ check 制約で許可されない type をスキップ: ${[...droppedTypes].join(", ")}`);
      }
      return;
    }

    // 1) Missing column: PGRST204
    const missingColumn = error.message.match(/Could not find the '([^']+)' column/);
    if (missingColumn && !droppedCols.has(missingColumn[1])) {
      const col = missingColumn[1];
      droppedCols.add(col);
      current = current.map((row) => {
        const copy = { ...row };
        delete copy[col];
        return copy;
      });
      continue;
    }

    // 2) CHECK violation on the type column
    if (opts.typeColumn && /check constraint/i.test(error.message)) {
      // Extract the offending row's type from the `details` field when
      // available (PostgREST passes it through as JSON in error.details
      // OR concatenated into error.message as "Failing row contains (...)")
      const typeVal = extractFailingTypeValue(error, opts.typeColumn, current);
      if (typeVal && !droppedTypes.has(typeVal)) {
        droppedTypes.add(typeVal);
        current = current.filter((r) => r[opts.typeColumn!] !== typeVal);
        continue;
      }
    }

    console.error(`❌ ${table} upsert failed:`, error.message);
    throw error;
  }
  throw new Error(`${table} upsert: too many schema mismatches`);
}

function extractFailingTypeValue(
  error: { message: string; details?: string | null },
  typeColumn: string,
  rows: Record<string, unknown>[],
): string | null {
  // Prefer the "Failing row contains (...)" tail, which lists column values
  // in declaration order. We don't know the precise position of the type
  // column here, so fall back to matching against the known set of types in
  // `rows` — whichever value appears in the failing row is the offender.
  const text = `${error.message} ${error.details ?? ""}`;
  const candidates = new Set<string>(rows.map((r) => String(r[typeColumn] ?? "")));
  for (const candidate of candidates) {
    if (candidate && text.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function reset(): Promise<void> {
  console.log("🧹 デモテナントのデータを削除します...");
  // documents.tenant_id は ON DELETE RESTRICT (金銭データ保護, 20260323070000_scale_hardening)。
  // tenant 削除前に明示的に請求書/帳票を消さないと RESTRICT で tenant 削除が失敗する。
  const { error: docErr } = await admin.from("documents").delete().eq("tenant_id", TENANT_ID);
  if (docErr && !docErr.message.includes("does not exist")) throw docErr;
  // 残り (customers/vehicles/certificates/reservations 等) は tenant 削除で cascade。
  const { error } = await admin.from("tenants").delete().eq("id", TENANT_ID);
  if (error) throw error;
  console.log("✅ 削除完了。");
}

// ─── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--reset")) {
    await reset();
    return;
  }
  if (args.has("--filming-cleanup")) {
    await filmingCleanup();
    return;
  }

  console.log("🚀 デモテナント `Ledra Motors` をセットアップします...\n");

  // 1) Tenant
  console.log("─ Tenant");
  await upsert("tenants", [TENANT], "id");
  console.log(`  ✓ ${TENANT.name} (${TENANT.slug})`);

  // 2) Customers
  console.log("─ Customers");
  const customerRows = CUSTOMERS.map((c) => ({
    id: uuid("c001", c.idn),
    tenant_id: TENANT_ID,
    name: c.name,
    name_kana: c.name_kana,
    email: c.email,
    phone: c.phone,
    postal_code: c.postal_code,
    address: c.address,
    note: c.note ?? null,
  }));
  await upsert("customers", customerRows, "id");
  console.log(`  ✓ ${customerRows.length} 件`);

  // 3) Vehicles
  console.log("─ Vehicles");
  const vehicleRows = VEHICLES.map((v) => {
    const customer = CUSTOMERS.find((c) => c.idn === v.customerIdn);
    if (!customer) throw new Error(`missing customer idn=${v.customerIdn}`);
    return {
      id: uuid("v001", v.idn),
      tenant_id: TENANT_ID,
      maker: v.maker,
      model: v.model,
      year: v.year,
      plate_display: v.plate_display,
      vin_code: v.vin_code ?? null,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone_masked: customer.phone.slice(-4),
      notes: v.notes ?? null,
    };
  });
  await upsert("vehicles", vehicleRows, "id");
  console.log(`  ✓ ${vehicleRows.length} 台`);

  // 4) Certificates
  console.log("─ Certificates");
  const certRows = CERTS.map((ct) => {
    const vehicle = VEHICLES.find((v) => v.idn === ct.vehicleIdn);
    if (!vehicle) throw new Error(`missing vehicle idn=${ct.vehicleIdn}`);
    const customer = CUSTOMERS.find((c) => c.idn === vehicle.customerIdn);
    if (!customer) throw new Error(`missing customer for vehicle idn=${ct.vehicleIdn}`);

    return {
      id: uuid("ce01", ct.idn),
      tenant_id: TENANT_ID,
      public_id: ct.public_id,
      vehicle_id: uuid("v001", ct.vehicleIdn),
      customer_id: uuid("c001", vehicle.customerIdn),
      status: ct.status ?? "active",
      customer_name: customer.name,
      certificate_no:
        ct.certificate_no ?? `${dateDaysAgo(ct.daysAgo).slice(0, 4)}-LDM-${String(ct.idn).padStart(4, "0")}`,
      service_type: ct.service_type,
      vehicle_info_json: {
        maker: vehicle.maker,
        model: vehicle.model,
        year: vehicle.year,
        plate_display: vehicle.plate_display,
      },
      content_preset_json: {
        title: ct.preset_title,
        products: ct.preset_products ?? [],
      },
      content_free_text:
        ct.free_text ??
        `${vehicle.maker} ${vehicle.model} に ${ct.preset_title} を施工しました。詳細は別紙作業報告書をご確認ください。`,
      maintenance_json: ct.maintenance_json ?? {},
      body_repair_json: ct.body_repair_json ?? {},
      current_version: 1,
      created_at: dateDaysAgo(ct.daysAgo),
      updated_at: dateDaysAgo(ct.daysAgo),
    };
  });
  await upsert("certificates", certRows, "id");
  console.log(`  ✓ ${certRows.length} 枚（public_id: LEDRA-DEMO-0001 〜 ${String(certRows.length).padStart(4, "0")}）`);

  // 5) Certificate images
  //    HeroCard の施工記録数カウンタと、公開証明書ページのギャラリー件数を成立させるために投入。
  //    以前は行(メタデータ)だけを作り実ファイルを Storage に置かなかったため、公開ページの
  //    <img …/object/public/assets/demo/…> が全て 400 (Object not found) を返していた。
  //    下の 5b) で各 storage_path に軽量プレースホルダ JPEG をアップロードして 400 を解消する。
  console.log("─ Certificate images");
  // 既存の seed 残骸を一旦削除（storage_path UNIQUE 制約回避）
  const certIds = certRows.map((c) => c.id);
  const { error: imgDelErr } = await admin
    .from("certificate_images")
    .delete()
    .in("certificate_id", certIds);
  if (imgDelErr && !imgDelErr.message.includes("not exist")) {
    console.error("⚠️ 既存 certificate_images の掃除に失敗:", imgDelErr.message);
  }

  // プレースホルダ本体を先に生成し、file_size をアップロードする実バイト数に一致させる
  // (実ファイルが存在する以上、admin ギャラリーの容量表示と齟齬させない)。
  const placeholder = await generateDemoPlaceholderJpeg();
  const imageRows = certRows.flatMap((cert, certIdx) => {
    // 1 枚の証明書につき 3〜5 枚の施工写真メタデータを作る
    const count = 3 + (certIdx % 3);
    // storage_path はテーブル側に UNIQUE 制約があるので、cert 単位でユニーク化
    return Array.from({ length: count }).map((_, i) => ({
      id: uuid("cf01", certIdx * 10 + i + 1),
      tenant_id: TENANT_ID,
      certificate_id: cert.id,
      storage_path: `demo/${cert.public_id}/${String(i + 1).padStart(2, "0")}.jpg`,
      file_name: `${cert.public_id}-${String(i + 1).padStart(2, "0")}.jpg`,
      content_type: "image/jpeg",
      file_size: placeholder.length,
      sort_order: i,
    }));
  });
  await upsert("certificate_images", imageRows, "id");
  console.log(`  ✓ ${imageRows.length} 件`);

  // 5b) 各 storage_path に同じプレースホルダ JPEG を配置 (upsert / 並列)。
  //     これが無いと公開ページの <img> が全て Storage 400 を出す。同一バッファを
  //     独立パスへ上げるだけなので順序非依存 → Promise.all でまとめて実行する。
  console.log("─ Certificate image placeholders");
  const uploadResults = await Promise.all(
    imageRows.map(async (img) => {
      const { error } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(img.storage_path, placeholder, { contentType: "image/jpeg", upsert: true });
      if (error) console.warn(`  ⚠️ placeholder upload 失敗 (${img.storage_path}): ${error.message}`);
      return !error;
    }),
  );
  const uploaded = uploadResults.filter(Boolean).length;
  console.log(`  ✓ ${uploaded}/${imageRows.length} 件を Storage にアップロード`);
  // 1 枚でも失敗すると公開ページに 400 が残る。best-effort で握り潰さず、
  // 非対話 (CI/cron) でも失敗が緑の exit 0 に埋もれないよう記録して最後に throw する。
  if (uploaded < imageRows.length) {
    placeholderUploadFailures = imageRows.length - uploaded;
  }

  // 6) Vehicle histories (車両ページ・公開証明書ページの「履歴」セクション用)
  console.log("─ Vehicle histories");
  // こちらも念のため既存 seed 分を掃除
  const vehicleIds = vehicleRows.map((v) => v.id);
  const { error: histDelErr } = await admin
    .from("vehicle_histories")
    .delete()
    .in("vehicle_id", vehicleIds);
  if (histDelErr && !histDelErr.message.includes("not exist")) {
    console.error("⚠️ 既存 vehicle_histories の掃除に失敗:", histDelErr.message);
  }
  const historyRows: Record<string, unknown>[] = [];
  let histCounter = 0;
  for (const cert of CERTS) {
    histCounter += 1;
    historyRows.push({
      id: uuid("a501", histCounter),
      tenant_id: TENANT_ID,
      vehicle_id: uuid("v001", cert.vehicleIdn),
      certificate_id: uuid("ce01", cert.idn),
      type: "certificate_issued",
      title: cert.service_type === "maintenance" ? cert.preset_title : `${cert.preset_title} 施工`,
      description: (cert.preset_products ?? []).join(" / ") || "施工完了",
      performed_at: dateDaysAgo(cert.daysAgo),
    });
  }
  // 車両ごとに「車両を登録」イベントを足してタイムラインの起点を作る
  // (type は src/lib/audit/certificateLog.ts の AuditEventType 仕様に合わせる)
  for (const v of VEHICLES) {
    // 最古施工の前日を登録日とみなす（複数施工されていれば全てより前の時点）
    const firstCert = CERTS.filter((c) => c.vehicleIdn === v.idn).sort((a, b) => b.daysAgo - a.daysAgo)[0];
    if (!firstCert) continue;
    histCounter += 1;
    historyRows.push({
      id: uuid("a501", histCounter),
      tenant_id: TENANT_ID,
      vehicle_id: uuid("v001", v.idn),
      type: "vehicle_registered",
      title: "車両を登録",
      description: `${v.maker} ${v.model} (${v.plate_display}) を登録`,
      performed_at: dateDaysAgo(firstCert.daysAgo + 1),
    });
  }
  await upsert("vehicle_histories", historyRows, "id", { typeColumn: "type" });
  console.log(`  ✓ 投入完了（不許可の type は自動スキップ済み）`);

  // 6b) NFC tag (撮影用ヒーロー車両)
  console.log("─ NFC tags");
  await upsert(
    "nfc_tags",
    [
      {
        id: uuid("nf01", HERO_NFC.idn),
        tenant_id: TENANT_ID,
        tag_code: HERO_NFC.tag_code,
        uid: HERO_NFC.uid,
        vehicle_id: uuid("v001", HERO_NFC.vehicleIdn),
        certificate_id: uuid("ce01", HERO_NFC.certIdn),
        status: "attached",
        written_at: dateDaysAgo(HERO_NFC.daysAgo),
        attached_at: dateDaysAgo(HERO_NFC.daysAgo),
      },
    ],
    "id",
  );
  console.log(`  ✓ ${HERO_NFC.tag_code} → LEDRA-DEMO-${String(HERO_NFC.certIdn).padStart(4, "0")}`);

  // 7) Reservations (予約 → 請求 導線)
  console.log("─ Reservations");
  const reservationRows = RESERVATIONS.map((r) => {
    const vehicle = VEHICLES.find((v) => v.idn === r.vehicleIdn);
    if (!vehicle) throw new Error(`missing vehicle idn=${r.vehicleIdn}`);
    const amount = r.items.reduce((s, it) => s + it.price, 0);
    const createdDaysAgo = Math.max(0, -r.dayOffset);
    return {
      id: uuid("rsv1", r.idn),
      tenant_id: TENANT_ID,
      customer_id: uuid("c001", vehicle.customerIdn),
      vehicle_id: uuid("v001", r.vehicleIdn),
      title: r.title,
      menu_items_json: r.items.map((it) => ({ name: it.name, price: it.price })),
      note: r.note ?? null,
      scheduled_date: ymdOffset(r.dayOffset),
      start_time: r.start,
      end_time: r.end,
      status: r.status,
      estimated_amount: amount,
      cancelled_at: r.status === "cancelled" ? dateDaysAgo(createdDaysAgo) : null,
      cancel_reason: r.cancelReason ?? null,
      created_at: dateDaysAgo(createdDaysAgo),
    };
  });
  await upsert("reservations", reservationRows, "id", { typeColumn: "status" });
  console.log(`  ✓ ${reservationRows.length} 件`);

  // 8) Invoices (請求書: 下書き / 送付済 / 入金済)
  console.log("─ Invoices");
  const invoiceYm = new Date().toISOString().slice(0, 7).replace("-", "");
  const invoiceRows = INVOICES.map((inv) => {
    const vehicle = VEHICLES.find((v) => v.idn === inv.vehicleIdn);
    if (!vehicle) throw new Error(`missing vehicle idn=${inv.vehicleIdn}`);
    const customer = CUSTOMERS.find((c) => c.idn === vehicle.customerIdn);
    if (!customer) throw new Error(`missing customer for vehicle idn=${inv.vehicleIdn}`);
    const itemsJson = inv.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: "式",
      unit_price: it.unit_price,
      amount: it.quantity * it.unit_price,
      tax_rate: 10,
    }));
    const subtotal = itemsJson.reduce((s, it) => s + it.amount, 0);
    const tax = Math.round(subtotal * 0.1);
    const paid = inv.status === "paid" && inv.paidDaysAgo != null;
    return {
      id: uuid("inv1", inv.idn),
      tenant_id: TENANT_ID,
      customer_id: uuid("c001", vehicle.customerIdn),
      vehicle_id: uuid("v001", inv.vehicleIdn),
      doc_type: "invoice",
      doc_number: `INV-${invoiceYm}-${String(inv.seq).padStart(3, "0")}`,
      issued_at: ymdOffset(-inv.issuedDaysAgo),
      due_date: ymdOffset(inv.dueInDays),
      status: inv.status,
      subtotal,
      tax,
      total: subtotal + tax,
      tax_rate: 10,
      tax_breakdown: [{ rate: 10, subtotal, tax }],
      note: null,
      items_json: itemsJson,
      meta_json: {},
      is_invoice_compliant: false,
      show_seal: false,
      show_logo: true,
      show_bank_info: true,
      recipient_name: customer.name,
      vehicle_info_json: {
        maker: vehicle.maker,
        model: vehicle.model,
        year: vehicle.year,
        plate_display: vehicle.plate_display,
      },
      payment_date: paid ? ymdOffset(-(inv.paidDaysAgo as number)) : null,
      created_at: dateDaysAgo(inv.issuedDaysAgo),
      updated_at: dateDaysAgo(paid ? (inv.paidDaysAgo as number) : inv.issuedDaysAgo),
    };
  });
  await upsert("documents", invoiceRows, "id", { typeColumn: "doc_type" });
  console.log(`  ✓ ${invoiceRows.length} 件`);

  if (args.has("--filming")) await filmingSetup();

  // 9) Report
  console.log("\n🎉 セットアップ完了\n");
  console.log("  Tenant ID :", TENANT_ID);
  console.log("  Tenant slug:", TENANT_SLUG);
  console.log("  Customers :", customerRows.length);
  console.log("  Vehicles  :", vehicleRows.length);
  console.log("  Certificates:", certRows.length);
  console.log("  Images    :", imageRows.length);
  console.log("  Histories :", historyRows.length);
  console.log("  Reservations:", reservationRows.length);
  console.log("  Invoices  :", invoiceRows.length);
  console.log("\n  撮影用ヒーロー車両 (NFC タグに書き込む URL):");
  console.log(`    https://app.ledra.co.jp/c/LEDRA-DEMO-${String(HERO_NFC.certIdn).padStart(4, "0")}`);
  console.log("\n  公開証明書の例:");
  CERTS.slice(0, 3).forEach((c) => {
    console.log(`    https://app.ledra.co.jp/c/${c.public_id}`);
  });
  console.log("\n  リセット: npx tsx scripts/setup-demo-tenant.ts --reset");

  // DB シードは完了させたうえで、プレースホルダ配置に失敗があれば非ゼロ終了させる
  // (公開ページの Storage 400 が残っているサイン)。
  if (placeholderUploadFailures > 0) {
    throw new Error(
      `プレースホルダ画像 ${placeholderUploadFailures} 件のアップロードに失敗しました。` +
        `公開証明書ページの該当画像は Storage 400 のままです。`,
    );
  }
}

// ─── 撮影用（--filming / --filming-cleanup）──────────────────
// 社内撮影・非公開の紹介動画のための特例（DECISION_LOG 2026-10-07）。本番では
// Polygon アンカーがまだ動いていないので、ヒーロー車両の記録に「アンカー済み」の
// 行を作って /c のブロックチェーン表示と /v/[vin] を撮れるようにする。
// cert_digest と Merkle root は本番と同じ関数で正しく計算するが、tx はチェーンに
// 送っていない（tx hash は root から作った値で、Polygonscan では見つからない）。
// デモテナントは公開されているので、撮影が終わったら --filming-cleanup で消すこと。

const HERO_VEHICLE_IDN = 11;
const HERO_VIN_NORMALIZED = "LDM800012345";
const FILMING_BATCH_ID = uuid("ab01", 1);
const FILMING_ORDER_ID = uuid("0d01", 1);

function heroCertIds(): string[] {
  return CERTS.filter((c) => c.vehicleIdn === HERO_VEHICLE_IDN).map((c) => uuid("ce01", c.idn));
}

async function filmingSetup(): Promise<void> {
  console.log("─ Filming: anchors / passport / report order");
  const placeholder = await generateDemoPlaceholderJpeg();
  const imageSha = createHash("sha256").update(placeholder).digest("hex");
  const heroIds = heroCertIds();

  // 1) 証明書ごとにアンカー済みの写真を 1 枚足す。既存の写真行は発行済み証明書の
  //    証跡列（sha256 / authenticity_grade）が凍結されていて更新できないので、新しい行で足す。
  const anchoredImages = heroIds.map((certId, i) => {
    const publicId = `LEDRA-DEMO-${certId.slice(-4)}`;
    return {
      id: uuid("cf02", i + 1),
      tenant_id: TENANT_ID,
      certificate_id: certId,
      storage_path: `demo/${publicId}/anchored.jpg`,
      file_name: `${publicId}-anchored.jpg`,
      content_type: "image/jpeg",
      file_size: placeholder.length,
      sort_order: 0,
      sha256: imageSha,
      authenticity_grade: "verified",
      polygon_network: "amoy",
      polygon_tx_hash: `0x${createHash("sha256").update(`ledra-demo-filming-image:${certId}`).digest("hex")}`,
    };
  });
  await upsert("certificate_images", anchoredImages, "id");
  await Promise.all(
    anchoredImages.map((img) =>
      admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(img.storage_path, placeholder, { contentType: "image/jpeg", upsert: true }),
    ),
  );

  // 2) 証明書記録のアンカー（cert_digest → Merkle → バッチ）
  const { data: certs, error: certErr } = await admin
    .from("certificates")
    .select(
      "id, public_id, tenant_id, status, created_at, updated_at, vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value",
    )
    .in("id", heroIds);
  if (certErr) throw certErr;
  const digests = (certs ?? []).map((c) => ({
    certId: c.id as string,
    ...computeCertDigest({
      publicId: c.public_id,
      tenantId: c.tenant_id,
      issuedAt: c.created_at,
      versionAt: c.updated_at ?? c.created_at,
      status: c.status === "void" ? "void" : "active",
      vehicleInfo: c.vehicle_info_json ?? null,
      contentFreeText: c.content_free_text,
      contentPreset: c.content_preset_json ?? null,
      expiryType: c.expiry_type ?? null,
      expiryValue: c.expiry_value ?? null,
      imageSha256s: [imageSha],
    }),
  }));
  const merkle = buildCertMerkle(digests.map((d) => d.digest));
  const anchoredAt = dateDaysAgo(1);
  // 再実行で root が変わる（updated_at が動く）ので、固定 id の行を上書きする
  await upsert(
    "certificate_anchor_batches",
    [
      {
        id: FILMING_BATCH_ID,
        merkle_root: merkle.root,
        leaf_count: merkle.leafCount,
        contract_address: "0x0000000000000000000000000000000000000000",
        network: "amoy",
        tx_hash: `0x${createHash("sha256").update(`ledra-demo-filming-batch:${merkle.root}`).digest("hex")}`,
        anchored_at: anchoredAt,
      },
    ],
    "id",
  );
  const anchorRows = digests.map((d, i) => ({
    id: uuid("ac01", i + 1),
    tenant_id: TENANT_ID,
    certificate_id: d.certId,
    cert_digest: d.digest,
    canonical_json: d.canonical,
    status: "anchored",
    anchor_route: "batch",
    batch_id: FILMING_BATCH_ID,
    merkle_proof: merkle.proofByDigest.get(d.digest) ?? [],
    polygon_network: "amoy",
    anchored_at: anchoredAt,
  }));
  await upsert("certificate_anchors", anchorRows, "id");
  for (const a of anchorRows) {
    const { error } = await admin.from("certificates").update({ latest_anchor_id: a.id }).eq("id", a.certificate_id);
    if (error) throw error;
  }

  // 3) 車両パスポート（/v/[vin]。本番は PASSPORT_PATENT_HOLD で 404 なのでローカルで撮る）
  const hero = VEHICLES.find((v) => v.idn === HERO_VEHICLE_IDN)!;
  const firstCert = CERTS.filter((c) => c.vehicleIdn === HERO_VEHICLE_IDN).sort((a, b) => b.daysAgo - a.daysAgo)[0];
  const { error: passErr } = await admin.from("vehicle_passports").upsert(
    {
      vin_code_normalized: HERO_VIN_NORMALIZED,
      display_maker: hero.maker,
      display_model: hero.model,
      display_year: hero.year,
      anchored_cert_count: heroIds.length,
      tenant_count: 1,
      first_seen_at: dateDaysAgo(firstCert.daysAgo),
      last_activity_at: anchoredAt,
    },
    { onConflict: "vin_code_normalized" },
  );
  if (passErr) throw passErr;

  // 4) 購入済みレポート（第三者視点で /v/[vin] の全履歴を開くため）。Stripe を通していない
  //    ので収益分配（vehicle_report_revenue_shares）は作られない。
  const token = randomBytes(32).toString("hex");
  const { error: orderErr } = await admin.from("vehicle_report_orders").upsert(
    {
      id: FILMING_ORDER_ID,
      vin_code_normalized: HERO_VIN_NORMALIZED,
      source_public_id: "LEDRA-DEMO-0027",
      access_token: token,
      status: "paid",
      amount_jpy: 3000,
      scope_type: "full",
      paid_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (orderErr) throw orderErr;

  console.log(`  ✓ アンカー ${anchorRows.length} 件（tx はチェーン未送信）/ パスポート / 購入済みレポート`);
  // cookie 名は src/lib/vehicleReport/access.ts の reportCookieName と同じ規則（import すると Supabase admin の env 読みが走る）
  console.log(`  /v/${HERO_VIN_NORMALIZED} を第三者として開く（ブラウザのコンソールで実行）:`);
  console.log(`    document.cookie = "vrt_${createHash("sha256").update(HERO_VIN_NORMALIZED).digest("hex").slice(0, 16)}=${token}; path=/; max-age=2592000"`);
}

async function filmingCleanup(): Promise<void> {
  console.log("🧹 撮影用データを削除します...");
  const seedIds = new Set(CERTS.map((c) => uuid("ce01", c.idn)));
  const { data: onHero, error: listErr } = await admin
    .from("certificates")
    .select("id")
    .eq("vehicle_id", uuid("v001", HERO_VEHICLE_IDN));
  if (listErr) throw listErr;
  const filmedIds = (onHero ?? []).map((c) => c.id as string).filter((id) => !seedIds.has(id));
  const heroIds = heroCertIds();

  const del = async (table: string, col: string, vals: string[]) => {
    if (vals.length === 0) return;
    const { error } = await admin.from(table).delete().in(col, vals);
    if (error) throw error;
  };
  await del("vehicle_report_orders", "id", [FILMING_ORDER_ID]);
  await del("vehicle_passports", "vin_code_normalized", [HERO_VIN_NORMALIZED]);
  const { error: unlinkErr } = await admin
    .from("certificates")
    .update({ latest_anchor_id: null })
    .in("id", [...heroIds, ...filmedIds]);
  if (unlinkErr) throw unlinkErr;
  await del("certificate_anchors", "certificate_id", [...heroIds, ...filmedIds]);
  await del("certificate_anchor_batches", "id", [FILMING_BATCH_ID]);

  // 発行済み証明書の写真は削除ガード（20260820000000）で消せないので、一時的に
  // draft に戻して消し、元の status に戻す。
  const { data: statuses, error: stErr } = await admin
    .from("certificates")
    .select("id, status")
    .in("id", [...heroIds, ...filmedIds]);
  if (stErr) throw stErr;
  const touched = (statuses ?? []).filter((c) => c.status !== "draft");
  for (const c of touched) {
    const { error } = await admin.from("certificates").update({ status: "draft" }).eq("id", c.id);
    if (error) throw error;
  }
  const anchoredImageIds = heroIds.map((_, i) => uuid("cf02", i + 1));
  await del("certificate_images", "id", anchoredImageIds);
  await del("certificate_images", "certificate_id", filmedIds);
  await del("vehicle_histories", "certificate_id", filmedIds);
  await del("certificates", "id", filmedIds);
  for (const c of touched.filter((t) => !filmedIds.includes(t.id))) {
    const { error } = await admin.from("certificates").update({ status: c.status }).eq("id", c.id);
    if (error) throw error;
  }
  console.log(`✅ 削除完了（撮影中に作った証明書 ${filmedIds.length} 件を含む）。書き込み窓の CLOSE も忘れずに。`);
}

main().catch((err) => {
  console.error("\n❌ エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
