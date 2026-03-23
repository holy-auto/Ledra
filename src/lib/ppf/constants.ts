/** PPF施工パネルプリセット */
export const PPF_PANEL_LABELS: Record<string, string> = {
  hood: "ボンネット",
  front_bumper: "フロントバンパー",
  rear_bumper: "リアバンパー",
  front_fenders: "フロントフェンダー",
  rear_fenders: "リアフェンダー/クォーター",
  doors: "ドアパネル",
  door_edges: "ドアエッジ",
  door_cups: "ドアカップ",
  rocker_panels: "ロッカーパネル/サイドステップ",
  a_pillars: "Aピラー",
  b_pillars: "Bピラー",
  side_mirrors: "サイドミラー",
  roof: "ルーフ",
  trunk_lid: "トランク/リアゲート",
  headlights: "ヘッドライト",
  taillights: "テールライト",
  fog_lights: "フォグランプ",
  windshield: "フロントガラス",
  luggage_area: "荷室リップ",
  full_body: "フルボディ",
};

/** パネルコードを日本語ラベルに変換 */
export function getPanelLabel(code: string): string {
  return PPF_PANEL_LABELS[code] ?? code;
}

/** PPFフィルムタイプ表示名 */
export const FILM_TYPE_LABELS: Record<string, string> = {
  gloss: "グロス（光沢）",
  matte: "マット（艶消し）",
  satin: "サテン",
  color: "カラー",
  black: "ブラック",
};

/** フィルムタイプコードを日本語ラベルに変換 */
export function getFilmTypeLabel(code: string): string {
  return FILM_TYPE_LABELS[code] ?? code;
}

/** カバレッジタイプ表示名 */
export function getCoverageLabel(coverage: string): string {
  return coverage === "full" ? "フル" : coverage === "partial" ? "部分" : coverage;
}
