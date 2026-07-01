/** 用品取付カテゴリ（取り付けた用品の種別）プリセット */
export const ACCESSORY_TYPE_LABELS: Record<string, string> = {
  car_navi: "カーナビ",
  etc: "ETC車載器",
  drive_recorder: "ドライブレコーダー",
  audio: "オーディオ・スピーカー",
  backup_camera: "バックカメラ",
  security: "セキュリティ・アラーム",
  tv_tuner: "TVチューナー",
  radar: "レーダー探知機",
  lighting: "LED・ライト",
  aero: "エアロパーツ",
  wheel: "ホイール・タイヤ",
  seat_cover: "シートカバー",
  floor_mat: "フロアマット",
  towing: "ヒッチメンバー・牽引装置",
  coating_option: "コーティング用品",
  other: "その他",
};

/** 用品カテゴリコードを日本語ラベルに変換 */
export function getAccessoryTypeLabel(code: string): string {
  return ACCESSORY_TYPE_LABELS[code] ?? code;
}

/** 取付位置プリセット */
export const INSTALL_LOCATION_LABELS: Record<string, string> = {
  front: "フロント",
  dashboard: "ダッシュボード",
  center_console: "センターコンソール",
  ceiling: "天井・ルーフ",
  rear: "リア",
  trunk: "トランク・ラゲッジ",
  under_hood: "エンジンルーム",
  exterior: "外装",
  interior: "内装",
  other: "その他",
};

/** 取付位置コードを日本語ラベルに変換 */
export function getInstallLocationLabel(code: string): string {
  return INSTALL_LOCATION_LABELS[code] ?? code;
}

/** 用品カテゴリ選択肢 */
export const ACCESSORY_TYPE_OPTIONS = Object.entries(ACCESSORY_TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** 取付位置選択肢 */
export const INSTALL_LOCATION_OPTIONS = Object.entries(INSTALL_LOCATION_LABELS).map(([value, label]) => ({
  value,
  label,
}));
