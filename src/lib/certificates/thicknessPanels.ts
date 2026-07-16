/**
 * 膜厚計測の標準部位（13）と、OCR が返した部位名を標準部位へ寄せる純関数。
 *
 * FilmThicknessSection（入力フォーム）と thicknessGaugeOcr（Vision OCR）の双方が
 * 同じ部位リストを参照するため、ここに一元化する。数値の座標（車体マップ）は
 * UI 固有なので FilmThicknessSection 側に残す。
 */

/** 標準部位（datalist と車体マップの部位キーに一致）。 */
export const THICKNESS_LOCATION_PRESETS = [
  "ボンネット",
  "ルーフ",
  "右フロントフェンダー",
  "左フロントフェンダー",
  "右フロントドア",
  "左フロントドア",
  "右リアドア",
  "左リアドア",
  "右リアフェンダー",
  "左リアフェンダー",
  "トランク/リアゲート",
  "右サイドステップ",
  "左サイドステップ",
] as const;

export type ThicknessLocationPreset = (typeof THICKNESS_LOCATION_PRESETS)[number];

// OCR が英語・別表記で返した部位名を標準部位へ寄せる最小エイリアス表。
// 確証のあるものだけを載せる（誤マッピングは手打ち修正より害が大きいため）。
const PANEL_ALIASES: Record<string, ThicknessLocationPreset> = {
  hood: "ボンネット",
  bonnet: "ボンネット",
  roof: "ルーフ",
  trunk: "トランク/リアゲート",
  tailgate: "トランク/リアゲート",
  トランク: "トランク/リアゲート",
  リアゲート: "トランク/リアゲート",
};

/**
 * OCR が返した部位名を標準部位（13）へ正規化する純関数。
 * - 前後空白を除去
 * - 標準部位に完全一致すればそのまま
 * - 既知エイリアス（英語名・略記）は対応する標準部位へ
 * - いずれにも当てはまらなければ trim した元文字列を返す（フォームは自由入力を許容）
 *
 * 誤って別部位へ寄せない保守的な設計。判断は最終的に人が編集して確定する。
 */
export function mapPanelToPreset(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if ((THICKNESS_LOCATION_PRESETS as readonly string[]).includes(s)) return s;
  return PANEL_ALIASES[s.toLowerCase()] ?? PANEL_ALIASES[s] ?? s;
}
