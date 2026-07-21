/**
 * First-touch UTM attribution.
 *
 * `/tora`（令和の虎バニティ）は視聴者を `/news/...?utm_source=tora` に着地させるが、
 * 実際のコンバージョン（`/poc`・`/contact/insurers` のフォーム）は別 URL で utm が付かない。
 * フォームがその場の URL だけを見ると放送経由の問い合わせが無印になり、放送の広告価値が
 * 計測から漏れる。着地リクエストで proxy（`src/proxy.ts`、Next 16 の middleware 相当）が
 * utm を first-touch のセッション cookie に保存し、フォームは「URL 優先 → cookie」で読むことで
 * 導線を跨いで帰属を保つ。cookie はサーバ側で着地時に確定するため、JS ハイドレート前に CTA を
 * タップしても取りこぼさない。
 *
 * ponytail: セッション cookie（maxAge 無し）のため、ブラウザを閉じる／別デバイスでの
 * コンバートは帰属が切れる（放送→同一セッション内で問い合わせ、を想定）。永続化が要れば
 * proxy 側で maxAge を付ける（同意前の永続マーケ cookie になる点は要検討）。
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export const UTM_COOKIE = "ledra_utm";

/** URL クエリから既知の utm キーだけ拾う（値は leads スキーマと同じ 120 字上限で防御）。 */
export function pickUtm(params: URLSearchParams): Utm {
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) out[key] = v.slice(0, 120);
  }
  return out;
}

/**
 * proxy(middleware) 用: 着地 URL から first-touch で保存すべき utm を返す。
 * 既に cookie がある（hasCookie）か utm が無ければ null（＝保存しない）。
 */
export function utmToPersist(params: URLSearchParams, hasCookie: boolean): Utm | null {
  if (hasCookie) return null;
  const utm = pickUtm(params);
  return Object.keys(utm).length === 0 ? null : utm;
}

function fromCookie(): Utm {
  const m = document.cookie.match(new RegExp("(?:^|; )" + UTM_COOKIE + "=([^;]*)"));
  if (!m) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1])) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Utm) : {};
  } catch {
    return {};
  }
}

/** URL の utm を優先し、無ければ middleware が保存した first-touch cookie を返す。 */
export function readUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const url = pickUtm(new URLSearchParams(window.location.search));
    if (Object.keys(url).length > 0) return url;
    return fromCookie();
  } catch {
    return {};
  }
}
