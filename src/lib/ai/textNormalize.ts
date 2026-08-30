/**
 * 表記揺れ正規化 (メーカー / 車種 / 住所 / 郵便番号)。
 *
 * deterministic な辞書照合を 1st pass、未解決のみ Haiku に投げる二段構え。
 * "TOYOTA" / "トヨタ" / "Toyota" の同一性、住所表記の "東京都" 省略形などを
 * 揃え、ユニーク化された値をマスタテーブルに保存できる形にする。
 *
 * - normalizeMaker, normalizeModel: 辞書ベース
 * - normalizeAddress: 都道府県名の補完 + 全角半角正規化
 * - normalizePostalCode: ハイフン挿入 / 半角化
 * - normalizeCustomerName: スペース統一 (姓と名の間)
 */

const MAKER_DICT: Array<{ canonical: string; aliases: RegExp[] }> = [
  {
    canonical: "トヨタ",
    aliases: [/^toyota$/i, /^トヨタ$/, /^豊田$/, /^toyota自動車/i],
  },
  { canonical: "日産", aliases: [/^nissan$/i, /^日産自動車$/, /^日産$/, /^ニッサン$/] },
  { canonical: "ホンダ", aliases: [/^honda$/i, /^本田技研$/, /^本田$/, /^ホンダ$/] },
  { canonical: "マツダ", aliases: [/^mazda$/i, /^マツダ$/, /^松田$/] },
  { canonical: "スバル", aliases: [/^subaru$/i, /^富士重工$/, /^スバル$/] },
  { canonical: "スズキ", aliases: [/^suzuki$/i, /^鈴木自動車$/, /^スズキ$/] },
  { canonical: "三菱", aliases: [/^mitsubishi$/i, /^三菱自動車$/, /^三菱$/, /^ミツビシ$/] },
  { canonical: "ダイハツ", aliases: [/^daihatsu$/i, /^ダイハツ$/, /^大発$/] },
  { canonical: "レクサス", aliases: [/^lexus$/i, /^レクサス$/] },
  { canonical: "BMW", aliases: [/^bmw$/i, /^bmw\s/i, /^ビーエムダブリュー$/] },
  { canonical: "メルセデス・ベンツ", aliases: [/^mercedes/i, /^benz$/i, /^ベンツ$/, /^メルセデス/] },
  { canonical: "アウディ", aliases: [/^audi$/i, /^アウディ$/] },
  { canonical: "フォルクスワーゲン", aliases: [/^volkswagen$/i, /^vw$/i, /^フォルクスワーゲン$/] },
  { canonical: "ポルシェ", aliases: [/^porsche$/i, /^ポルシェ$/] },
];

const PREFECTURE_PATTERNS: Array<{ canonical: string; aliases: RegExp[] }> = [
  { canonical: "東京都", aliases: [/^東京$/, /^tokyo$/i] },
  { canonical: "大阪府", aliases: [/^大阪$/, /^osaka$/i] },
  { canonical: "京都府", aliases: [/^京都$/, /^kyoto$/i] },
  { canonical: "北海道", aliases: [/^hokkaido$/i] },
];

export function normalizeMaker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  for (const entry of MAKER_DICT) {
    for (const re of entry.aliases) {
      if (re.test(trimmed)) return entry.canonical;
    }
  }
  // フォールバック: 全角空白除去 + 大文字化保持
  return trimmed.replace(/\s+/g, "");
}

/** 車種は "プリウス" / "PRIUS" の同一視程度のみ簡易正規化。 */
export function normalizeModel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // ASCII のみなら全大文字、それ以外は素のまま
  return /^[\x00-\x7F]+$/.test(t) ? t.toUpperCase() : t;
}

export interface NormalizedAddress {
  full: string;
  prefecture: string | null;
}

export function normalizeAddress(raw: string | null | undefined): NormalizedAddress {
  if (!raw) return { full: "", prefecture: null };
  let t = raw
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 先頭が "東京" などで都道府県が省略されていれば補う
  for (const p of PREFECTURE_PATTERNS) {
    for (const re of p.aliases) {
      if (re.test(t.split(/[ \-丁目]/)[0] ?? "")) {
        t = `${p.canonical}${t.slice((t.split(" ")[0] ?? "").length)}`.trim();
        return { full: t, prefecture: p.canonical };
      }
    }
  }

  const pref = /^(.{2,4}[都道府県])/.exec(t)?.[1] ?? null;
  return { full: t, prefecture: pref };
}

/** "1500043" / "150 0043" / "150-0043" / "1500043 " などを "150-0043" に。 */
export function normalizePostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw
    .replace(/[^\d０-９]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (digits.length !== 7) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/**
 * "山田  太郎" / "山田　太郎" / "やまだ たろう" など姓名の区切りを
 * 半角スペース 1 つに揃える。
 */
export function normalizeCustomerName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/[　]+/g, " ").replace(/\s+/g, " ").trim() || null;
}
