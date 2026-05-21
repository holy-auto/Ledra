/**
 * 標準施工テンプレート (Starter Service Packages) の定義。
 *
 * 新規テナントの「初日の体験」を埋めるため、業界でよく使う施工パッケージを
 * ワンクリックで投入できるようにする。`service_packages` は tenant 別なので
 * platform-wide な seed は出来ず、ここで TypeScript データとして持ち、
 * `POST /api/admin/service-packages/seed` から find-or-create で展開する。
 *
 * 価格は 2026 年時点の国内コーティング/PPF/ディテーリング店の中央値感を
 * 参考にした目安値。テナントが導入後に編集する前提なのであくまで叩き台。
 */
import type { ServicePackageCategory, PriceStrategy } from "@/lib/validations/service-package";

export interface StarterMenuItem {
  /** menu_items.name と一致する文字列 (case-insensitive で find-or-create) */
  name: string;
  /** 想定単価 (JPY)。既存 menu_item が見つかった場合はそちらを優先する */
  unit_price: number;
  /** デフォルト数量 */
  quantity: number;
  /** menu_items.tax_category。10=標準、8=軽減 */
  tax_category?: number;
}

export interface StarterPackage {
  /** UI / ログでの識別キー。name とは独立で安定 */
  key: string;
  name: string;
  description: string;
  category: ServicePackageCategory;
  price_strategy: PriceStrategy;
  /** price_strategy="fixed" の場合の合計価格 */
  fixed_price?: number;
  items: StarterMenuItem[];
}

/**
 * 投入対象のスターターパッケージ一覧。
 *
 * - **コーティング 3 段** (Lv1/Lv2/Lv3): 簡易・標準・プレミアム
 * - **PPF 2 種**: フロント部分のみ / フルボディ
 * - **ディテーリング 3 種**: ヘッドライト磨き / ホイールコーティング / 室内クリーニング
 * - **メンテナンス 2 種**: 鉄粉除去・下地処理 / 撥水ガラスコーティング
 *
 * 重複する明細名 (例: "下地処理") は seed 時に同じ menu_item を共有する。
 */
export const STARTER_PACKAGES: readonly StarterPackage[] = [
  {
    key: "coating-lv1",
    name: "ガラスコーティング Lv1 (簡易)",
    description: "1 day で完了する簡易ガラスコーティング。半年〜1 年の防汚効果。",
    category: "coating",
    price_strategy: "sum_of_items",
    items: [
      { name: "下地処理 (簡易)", unit_price: 8000, quantity: 1 },
      { name: "ガラスコーティング 1 層", unit_price: 22000, quantity: 1 },
    ],
  },
  {
    key: "coating-lv2",
    name: "ガラスコーティング Lv2 (標準)",
    description: "鉄粉除去 + 下地処理 + ガラスコーティング 2 層。1〜2 年の保護効果。",
    category: "coating",
    price_strategy: "sum_of_items",
    items: [
      { name: "鉄粉除去", unit_price: 6000, quantity: 1 },
      { name: "下地処理 (標準)", unit_price: 12000, quantity: 1 },
      { name: "ガラスコーティング 2 層", unit_price: 42000, quantity: 1 },
    ],
  },
  {
    key: "coating-lv3",
    name: "ガラスコーティング Lv3 (プレミアム)",
    description: "鉄粉除去 + 磨き + ガラスコーティング 3 層 + ホイール。3〜5 年の長期保護。",
    category: "coating",
    price_strategy: "sum_of_items",
    items: [
      { name: "鉄粉除去", unit_price: 6000, quantity: 1 },
      { name: "ボディ磨き (1 工程)", unit_price: 25000, quantity: 1 },
      { name: "ガラスコーティング 3 層", unit_price: 78000, quantity: 1 },
      { name: "ホイールコーティング", unit_price: 12000, quantity: 1 },
    ],
  },
  {
    key: "ppf-front-partial",
    name: "PPF フロント部分 (バンパー + ボンネット)",
    description: "飛び石が当たりやすいフロント部分のみの PPF 施工。",
    category: "ppf",
    price_strategy: "sum_of_items",
    items: [
      { name: "下地処理 (標準)", unit_price: 12000, quantity: 1 },
      { name: "PPF フロントバンパー", unit_price: 55000, quantity: 1 },
      { name: "PPF ボンネット", unit_price: 65000, quantity: 1 },
    ],
  },
  {
    key: "ppf-full-body",
    name: "PPF フルボディ",
    description: "ボディ全面を PPF で保護。最高級保護クラス。",
    category: "ppf",
    price_strategy: "sum_of_items",
    items: [
      { name: "下地処理 (標準)", unit_price: 12000, quantity: 1 },
      { name: "PPF フルボディ施工", unit_price: 480000, quantity: 1 },
    ],
  },
  {
    key: "headlight-polish",
    name: "ヘッドライト磨き + コーティング",
    description: "黄ばみ・くすみ除去 + UV コーティング。左右 1 セット。",
    category: "detailing",
    price_strategy: "fixed",
    fixed_price: 12000,
    items: [
      { name: "ヘッドライト磨き", unit_price: 6000, quantity: 1 },
      { name: "ヘッドライト UV コーティング", unit_price: 6000, quantity: 1 },
    ],
  },
  {
    key: "wheel-coating",
    name: "ホイールコーティング (4 本)",
    description: "ブレーキダスト固着防止コーティング。1 台分 4 本セット。",
    category: "detailing",
    price_strategy: "fixed",
    fixed_price: 16000,
    items: [{ name: "ホイールコーティング", unit_price: 4000, quantity: 4 }],
  },
  {
    key: "interior-cleaning-basic",
    name: "室内クリーニング (簡易)",
    description: "シート・フロアマット掃除機がけ + ダッシュボード拭き上げ。",
    category: "detailing",
    price_strategy: "fixed",
    fixed_price: 8000,
    items: [{ name: "室内クリーニング (簡易)", unit_price: 8000, quantity: 1 }],
  },
  {
    key: "interior-cleaning-deep",
    name: "室内クリーニング (徹底)",
    description: "シートリフレッシュ + 天井 + 内張りまで徹底クリーニング。",
    category: "detailing",
    price_strategy: "fixed",
    fixed_price: 35000,
    items: [
      { name: "室内クリーニング (徹底)", unit_price: 25000, quantity: 1 },
      { name: "シートリフレッシュ", unit_price: 10000, quantity: 1 },
    ],
  },
  {
    key: "windshield-coating",
    name: "撥水ガラスコーティング (フロント)",
    description: "フロントガラスの撥水コーティング。雨天時の視認性向上。",
    category: "maintenance",
    price_strategy: "fixed",
    fixed_price: 6000,
    items: [{ name: "撥水ガラスコーティング", unit_price: 6000, quantity: 1 }],
  },
  {
    key: "iron-removal-prep",
    name: "鉄粉除去 + 下地処理",
    description: "コーティング前の必須前処理。鉄粉除去 + 軽研磨で下地を整える。",
    category: "maintenance",
    price_strategy: "sum_of_items",
    items: [
      { name: "鉄粉除去", unit_price: 6000, quantity: 1 },
      { name: "下地処理 (標準)", unit_price: 12000, quantity: 1 },
    ],
  },
];

/**
 * 全 starter packages から重複を除いた menu_item 候補のリストを返す。
 * `name` (case-insensitive) で uniq する。同名で価格が異なる場合は先に出現したものを採用。
 */
export function uniqueStarterMenuItems(packages: readonly StarterPackage[] = STARTER_PACKAGES): StarterMenuItem[] {
  const seen = new Map<string, StarterMenuItem>();
  for (const pkg of packages) {
    for (const it of pkg.items) {
      const k = it.name.trim().toLowerCase();
      if (!seen.has(k)) seen.set(k, it);
    }
  }
  return Array.from(seen.values());
}
