/**
 * First-touch UTM attribution.
 *
 * `/tora`（令和の虎バニティ）は視聴者を `/news/...?utm_source=tora` に着地させるが、
 * 実際のコンバージョン（`/poc`・`/contact/insurers` のフォーム）は別 URL で、そこには
 * utm が付かない。フォームがその場の URL からしか utm を読まないと放送経由の問い合わせが
 * 無印になり、放送の広告価値が計測から漏れる。着地時に sessionStorage へ first-touch 保存し、
 * フォームは「URL 優先 → 保存値」で読むことで導線を跨いで帰属を保つ。
 *
 * ponytail: sessionStorage 保持のため、タブを閉じる／別タブ・別デバイスでコンバートすると
 * 帰属は失われる（放送→同一セッション内で問い合わせ、を想定）。セッションを跨ぐ帰属が要る
 * なら middleware でファーストパーティ cookie に格上げする。
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

const STORAGE_KEY = "ledra-utm";

function fromUrl(): Utm {
  const params = new URLSearchParams(window.location.search);
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * 着地時に呼ぶ。URL に utm があれば first-touch として保存する。
 * URL に utm が無ければ何もしない（後続ページで既存の帰属を空で上書きしない）。
 * 既に保存済みなら上書きしない（first-touch を優先）。
 */
export function captureUtm(): void {
  if (typeof window === "undefined") return;
  try {
    const url = fromUrl();
    if (Object.keys(url).length === 0) return;
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(url));
  } catch {
    // sessionStorage が使えない（プライベートモード等）場合は無視
  }
}

/** URL の utm を優先し、無ければ保存済み first-touch を返す。 */
export function readUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const url = fromUrl();
    if (Object.keys(url).length > 0) return url;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Utm) : {};
  } catch {
    return {};
  }
}
