/** 点検所見カテゴリ */
export const FINDING_CATEGORY_LABELS: Record<string, string> = {
  engine: "エンジン",
  transmission: "トランスミッション",
  brake: "ブレーキ",
  tire: "タイヤ",
  suspension: "サスペンション",
  steering: "ステアリング",
  electric: "電装系",
  exhaust: "排気系",
  cooling: "冷却系",
  oil: "オイル",
  battery: "バッテリー",
  body: "ボディ",
  other: "その他",
};

export const FINDING_CATEGORY_OPTIONS = Object.entries(FINDING_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** 点検所見の重要度 */
export const FINDING_SEVERITY_LABELS: Record<string, string> = {
  ok: "正常",
  advisory: "要注意",
  warning: "警告",
  critical: "要即対応",
};

export const FINDING_SEVERITY_OPTIONS = Object.entries(FINDING_SEVERITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** 部品交換カテゴリのプリセット */
export const PART_CATEGORY_PRESETS = [
  "engine_oil",
  "oil_filter",
  "air_filter",
  "brake_pad",
  "brake_rotor",
  "tire",
  "battery",
  "coolant",
  "transmission_oil",
  "spark_plug",
  "wiper_blade",
  "cabin_filter",
  "belt",
  "other",
];

export const PART_CATEGORY_LABELS: Record<string, string> = {
  engine_oil: "エンジンオイル",
  oil_filter: "オイルフィルター",
  air_filter: "エアフィルター",
  brake_pad: "ブレーキパッド",
  brake_rotor: "ブレーキローター",
  tire: "タイヤ",
  battery: "バッテリー",
  coolant: "クーラント",
  transmission_oil: "ミッションオイル",
  spark_plug: "スパークプラグ",
  wiper_blade: "ワイパーブレード",
  cabin_filter: "エアコンフィルター",
  belt: "ベルト類",
  other: "その他",
};

/** 整備作業種別プリセット */
export const WORK_TYPE_LABELS: Record<string, string> = {
  periodic_inspection: "定期点検",
  vehicle_inspection: "車検",
  oil_change: "オイル交換",
  tire_change: "タイヤ交換",
  brake_service: "ブレーキ整備",
  battery_replacement: "バッテリー交換",
  air_filter: "エアフィルター交換",
  coolant_change: "冷却水交換",
  transmission_service: "トランスミッション整備",
  suspension_service: "サスペンション整備",
  alignment: "アライメント調整",
  ac_service: "エアコン整備",
  wiper_replacement: "ワイパー交換",
  light_replacement: "ライト交換",
  other: "その他",
};

/** 作業種別コードを日本語ラベルに変換 */
export function getWorkTypeLabel(code: string): string {
  return WORK_TYPE_LABELS[code] ?? code;
}

/** 整備作業種別選択肢 */
export const WORK_TYPE_OPTIONS = Object.entries(WORK_TYPE_LABELS).map(([value, label]) => ({ value, label }));
