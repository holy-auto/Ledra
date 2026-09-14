/** 修理種別プリセット */
export const REPAIR_TYPE_LABELS: Record<string, string> = {
  bankin: "鈑金",
  paint: "塗装",
  bankin_paint: "鈑金塗装",
};

/** 修理種別コードを日本語ラベルに変換 */
export function getRepairTypeLabel(code: string): string {
  return REPAIR_TYPE_LABELS[code] ?? code;
}

/** 修理箇所プリセット */
export const REPAIR_PANEL_LABELS: Record<string, string> = {
  hood: "ボンネット",
  front_bumper: "フロントバンパー",
  rear_bumper: "リアバンパー",
  front_fender_r: "右フロントフェンダー",
  front_fender_l: "左フロントフェンダー",
  rear_fender_r: "右リアフェンダー/クォーター",
  rear_fender_l: "左リアフェンダー/クォーター",
  door_fr: "右フロントドア",
  door_fl: "左フロントドア",
  door_rr: "右リアドア",
  door_rl: "左リアドア",
  roof: "ルーフ",
  trunk_lid: "トランク/リアゲート",
  rocker_panel_r: "右ロッカーパネル",
  rocker_panel_l: "左ロッカーパネル",
  a_pillar: "Aピラー",
  b_pillar: "Bピラー",
  c_pillar: "Cピラー",
  side_mirror_r: "右サイドミラー",
  side_mirror_l: "左サイドミラー",
  other: "その他",
};

/** 修理箇所コードを日本語ラベルに変換 */
export function getRepairPanelLabel(code: string): string {
  return REPAIR_PANEL_LABELS[code] ?? code;
}

/** 塗装タイププリセット */
export const PAINT_TYPE_LABELS: Record<string, string> = {
  solid: "ソリッド",
  metallic: "メタリック",
  pearl: "パール",
  matte: "マット",
};

/** 塗装タイプコードを日本語ラベルに変換 */
export function getPaintTypeLabel(code: string): string {
  return PAINT_TYPE_LABELS[code] ?? code;
}

/** 修理方法プリセット */
export const REPAIR_METHOD_LABELS: Record<string, string> = {
  straightening: "板金修正",
  panel_replacement: "パネル交換",
  filler_repair: "パテ修正",
  dent_repair: "デント修理（PDR）",
  spot_paint: "スポット塗装",
  full_paint: "全塗装",
  blend_paint: "ボカシ塗装",
  other: "その他",
};

/** 修理方法コードを日本語ラベルに変換 */
export function getRepairMethodLabel(code: string): string {
  return REPAIR_METHOD_LABELS[code] ?? code;
}

/** 修理種別選択肢 */
export const REPAIR_TYPE_OPTIONS = Object.entries(REPAIR_TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** 修理箇所選択肢 */
export const REPAIR_PANEL_OPTIONS = Object.entries(REPAIR_PANEL_LABELS).map(([value, label]) => ({ value, label }));

/** 塗装タイプ選択肢 */
export const PAINT_TYPE_OPTIONS = Object.entries(PAINT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** 修理方法選択肢 */
export const REPAIR_METHOD_OPTIONS = Object.entries(REPAIR_METHOD_LABELS).map(([value, label]) => ({ value, label }));
