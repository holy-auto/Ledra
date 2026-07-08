/**
 * 郵便番号 → 住所 補完 (クライアントサイド)
 *
 * zipcloud (日本郵便の郵便番号データを提供する無料 API / CORS 対応) を利用する。
 * 決定論的に解ける入力補完のため AI は使わない。
 * 失敗時は null を返す fail-soft 設計 (補完できなくても手入力を妨げない)。
 */

export type PostalAddress = {
  prefecture: string;
  city: string;
  town: string;
  /** 都道府県+市区町村+町域 を連結した表示用住所 */
  full: string;
};

const ZIPCLOUD_ENDPOINT = "https://zipcloud.ibsnet.co.jp/api/search";
const LOOKUP_TIMEOUT_MS = 5000;

/** ハイフン・全角数字を許容して 7 桁の郵便番号に正規化する。7 桁にならなければ null。 */
export function normalizePostalCode(input: string): string | null {
  // 全角数字・全角ハイフンを半角化してから、7 桁 (任意の中間ハイフン) の形を厳密に検証する。
  // collapse-and-count だと "abc1234567xyz" のような混入も通ってしまうため raw shape を見る。
  const normalized = input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[‐－ー―]/g, "-")
    .trim();
  return /^\d{3}-?\d{4}$/.test(normalized) ? normalized.replace(/-/g, "") : null;
}

type ZipcloudResult = {
  address1?: string;
  address2?: string;
  address3?: string;
};

/**
 * 郵便番号から住所を取得する。見つからない / 通信失敗 / タイムアウト時は null。
 */
export async function lookupPostalAddress(postalCode: string): Promise<PostalAddress | null> {
  const normalized = normalizePostalCode(postalCode);
  if (!normalized) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${ZIPCLOUD_ENDPOINT}?zipcode=${normalized}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: { status?: number; results?: ZipcloudResult[] | null } = await res.json();
    const hit = json.results?.[0];
    if (!hit) return null;
    const prefecture = hit.address1 ?? "";
    const city = hit.address2 ?? "";
    const town = hit.address3 ?? "";
    const full = `${prefecture}${city}${town}`;
    if (!full) return null;
    return { prefecture, city, town, full };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
