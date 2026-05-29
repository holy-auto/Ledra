/**
 * AI ヘルパ間で重複していた小さなユーティリティ集。
 *
 * `clip()` / `sizeMultiplier()` / 句点で切る `clipToSentence()` などは
 * 複数の AI モジュールが独自に持っていたが、シグネチャと挙動が同じなので
 * ここに集約する。挙動が極微妙に違う場合 (例: 句点切り出しの閾値) は
 * オプション引数で表現する。
 */

/**
 * 文字列を maxLen まで切り詰める。前後空白除去 + 絵文字 / 装飾記号削除付き。
 *
 * 全角換算ではなくただの長さチェックなので、用途に応じて呼び出し側で
 * 文字種を見て maxLen を決めるか、`clipZenkaku()` の方を使うこと。
 */
export function clipText(text: string, maxLen: number): string {
  const t = text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, "")
    .trim();
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastDot = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("."));
  if (lastDot > maxLen * 0.5) return slice.slice(0, lastDot + 1);
  return slice;
}

/**
 * 全角換算で maxLen 文字までに切り詰める (ASCII を 0.5 文字、それ以外を 1 文字)。
 *
 * 案件タイトル等 UI に並べる短い文字列向け。絵文字は弾く。
 */
export function clipZenkaku(raw: string, maxZenkaku: number): string {
  const t = raw
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  let total = 0;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const w = c < 0x80 ? 0.5 : 1;
    if (total + w > maxZenkaku) {
      cut = i;
      break;
    }
    total += w;
  }
  return t.slice(0, cut);
}

/**
 * 車両サイズ係数 (SS=1, S=+5%, M=+10%, L=+15%, LL=+20%, XL=+25%)。
 * メニュー / 見積もり価格の baseline に掛ける。
 */
export function sizeMultiplier(size: string | null | undefined): number {
  switch ((size ?? "").toUpperCase()) {
    case "SS":
      return 1;
    case "S":
      return 1.05;
    case "M":
      return 1.1;
    case "L":
      return 1.15;
    case "LL":
      return 1.2;
    case "XL":
      return 1.25;
    default:
      return 1;
  }
}
