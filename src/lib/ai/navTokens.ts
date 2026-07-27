/**
 * ナビ静的フォールバック用の軽量トークナイザ。
 *
 * AI 不通時のフォールバックで「予約を開いて」のような自然文を、画面ラベル
 * （「予約管理」等）に substring 照合できるよう分割する。全文一致だと助詞や
 * 動詞語尾が混ざって当たらないため。
 *
 * ponytail: 形態素解析は使わない。カタカナ/漢字/英数字の連続(2文字以上)を抽出し、
 * 空白区切りも併用する簡易版。動詞語尾（「開いて」等）は残るが substring 照合で無害。
 */
export function tokenizeQuery(q: string): string[] {
  const tokens = new Set<string>();
  for (const t of q.toLowerCase().split(/\s+/)) if (t.length >= 2) tokens.add(t);
  // カタカナ(＋長音)／漢字／英数字の連続をトークン化。
  for (const run of q.match(/[゠-ヿー]{2,}|[一-鿿]{2,}|[A-Za-z0-9]{2,}/g) ?? []) {
    tokens.add(run.toLowerCase());
  }
  return [...tokens];
}
