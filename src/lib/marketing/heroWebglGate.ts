/**
 * Hero の 3D 演出（WebGL）を出すかどうかの判定。
 *
 * 3D は「最先端の印象」のための演出であって、LCP・INP・離脱率を犠牲に
 * してよいものではない。判定は保守的に倒す — 迷ったら静的スクショのまま。
 *
 * 判定を純関数に分離しているのは、jsdom で WebGL が動かなくても
 * ゲートのロジック自体はテストできるようにするため。
 */

export type HeroWebglEnv = {
  /** 論理コア数 (navigator.hardwareConcurrency)。取得不能なら undefined */
  hardwareConcurrency: number | undefined;
  /** 端末メモリ GB (navigator.deviceMemory)。Chrome 系のみ。取得不能なら undefined */
  deviceMemory: number | undefined;
  /** ビューポートが lg (1024px) 以上か — モバイルでは常に静的表示 */
  isDesktopViewport: boolean;
  /** prefers-reduced-motion: reduce か */
  prefersReducedMotion: boolean;
  /** データセーバー (navigator.connection.saveData) が有効か。取得不能なら false */
  saveData: boolean;
};

export function isHeroWebglCapable(env: HeroWebglEnv): boolean {
  if (!env.isDesktopViewport) return false;
  if (env.prefersReducedMotion) return false;
  if (env.saveData) return false;
  // コア数が取れて 4 未満なら低スペックとみなす。取れない場合は許可
  // （取得不能 = 古い環境とは限らず、プライバシー設定のことが多い）。
  if (env.hardwareConcurrency !== undefined && env.hardwareConcurrency < 4) return false;
  // deviceMemory は Chrome 系のみ。取れて 4GB 未満なら見送る。
  if (env.deviceMemory !== undefined && env.deviceMemory < 4) return false;
  return true;
}

/** ブラウザ環境から HeroWebglEnv を収集する（SSR では常に非対応を返す） */
export function readHeroWebglEnv(): HeroWebglEnv {
  if (typeof window === "undefined") {
    return {
      hardwareConcurrency: undefined,
      deviceMemory: undefined,
      isDesktopViewport: false,
      prefersReducedMotion: false,
      saveData: false,
    };
  }
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    isDesktopViewport: window.matchMedia("(min-width: 1024px)").matches,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
  };
}
