/**
 * 軽量な A/B 実験レジストリ（クライアント側バケッティング）。
 *
 * 目的: CTA コピー等の文言差し替えを、外部 SaaS の設定なしに repo 内で
 * 決定的に振り分け、露出とクリックを既存の PostHog 計測に流す。
 *
 * 設計方針:
 * - 割当は純関数（同一 unitId → 常に同じ variant）。テストで担保する。
 * - unitId は localStorage に保持した匿名 ID。同意の有無に依存しない
 *   （露出/クリックの送信は track() が同意時のみ行うので、割当自体は安全）。
 * - SSR では常に control を出し、マウント後にクライアントで切り替える
 *   （ハイドレーション不整合を避ける）。表示側の責務は ExperimentText。
 *
 * ponytail: 2 群 50/50 の最小実装。多群・重み付け・PostHog feature flag 連携が
 * 必要になったら assignVariant を差し替える（呼び出し側の API は不変）。
 */

export type Variant = "control" | "treatment";

export type ExperimentKey = "hero_primary_cta" | "home_final_cta";

export type Experiment = {
  key: ExperimentKey;
  /** variant ごとの表示文言 */
  variants: Record<Variant, string>;
};

export const EXPERIMENTS: Record<ExperimentKey, Experiment> = {
  hero_primary_cta: {
    key: "hero_primary_cta",
    variants: {
      control: "無料で試す",
      treatment: "5分で証明書を発行",
    },
  },
  home_final_cta: {
    key: "home_final_cta",
    variants: {
      control: "無料で試す",
      treatment: "5分で無料発行を試す",
    },
  },
};

/** FNV-1a 32bit ハッシュ（決定的・依存なし）。 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32bit に丸めつつ乗算（>>> 0 で符号なし化）
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** unitId を実験キーで混ぜて 50/50 に割り当てる（純関数）。 */
export function assignVariant(key: ExperimentKey, unitId: string): Variant {
  return hashString(`${key}:${unitId}`) % 2 === 0 ? "control" : "treatment";
}

const UNIT_ID_STORAGE_KEY = "ledra-exp-uid";

/**
 * 匿名の unit ID を取得（無ければ生成して localStorage に保持）。
 * ブラウザ以外・ストレージ不可の場合は毎回新規のフォールバック ID を返す
 * （その場合バケットは安定しないが、割当ロジックは壊れない）。
 */
export function getExperimentUnitId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(UNIT_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(UNIT_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}
