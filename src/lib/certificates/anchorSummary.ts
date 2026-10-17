/**
 * 証明書 PDF が「刻印あり」と数える集合と、その件数。
 *
 * `@react-pdf` も `Font.register`（約 4.7MB の TTF を base64 化する）も要らない純関数なので、
 * `pdfCertificate.tsx` から分けてある（件数のテストがフォントの読み込みを引き連れないため）。
 */

/** PDF に刻印の根拠を出すのに必要な情報が揃ったアンカー。 */
export type AnchorLike = {
  sha256: string | null;
  polygon_tx_hash: string | null;
  polygon_network: "polygon" | "amoy" | null;
};

export type VerifiableAnchor<T extends AnchorLike = AnchorLike> = T & {
  polygon_tx_hash: string;
  polygon_network: "polygon" | "amoy";
};

/**
 * **PDF が根拠として示せる**アンカーだけに絞る。tx hash とネットワークの両方が要る ——
 * ネットワークが分からないと Polygonscan の URL を作れず、QR も探索リンクも出せない。
 *
 * 「刻印あり」と数えるものを**この1箇所で決める**。以前は QR 生成の中でこの条件で絞りつつ、
 * 件数（「ほか N 枚もオンチェーン記録済み（全 M 枚）」）は tx hash の有無だけで数えていたので、
 * **ネットワーク不明の行が「記録済み」に数えられていた** —— QR も出ないので、読んだ人には
 * 確かめる手段が無い（`/code-review` の指摘。2026-10-17）。
 *
 * ponytail: ここで言う「刻印あり」は **PDF 上で検証リンクを出せる**という意味。
 * 「チェーンに書かれている」ことの判定ではない（tx が実在するかは読んでいない）。
 * そのため `api/public/verify` や管理画面の「刻印済み」件数（`polygon_tx_hash` の有無で数える）
 * とは一致しないことがある。揃えるなら、それらの呼び出し側もこの関数に寄せる必要がある。
 */
export function verifiableAnchors<T extends AnchorLike>(anchors: T[] | undefined): VerifiableAnchor<T>[] {
  return (anchors ?? []).filter(
    (a): a is VerifiableAnchor<T> =>
      typeof a.polygon_tx_hash === "string" &&
      a.polygon_tx_hash.length > 0 &&
      (a.polygon_network === "polygon" || a.polygon_network === "amoy"),
  );
}

/**
 * PDF に出す件数。`total` と `more` を**同じ集合から**出すことで、
 * 「QR は 1 枚なのに『ほか 4 枚もオンチェーン記録済み（全 5 枚）』」が起きないようにする。
 *
 * @param maxQr PDF に載せる QR の上限（`MAX_ANCHOR_QR`）。
 */
export function anchorCounts<T extends AnchorLike>(
  anchors: T[] | undefined,
  maxQr: number,
): { verifiable: VerifiableAnchor<T>[]; total: number; shown: number; more: number } {
  const verifiable = verifiableAnchors(anchors);
  const total = verifiable.length;
  const shown = Math.min(total, Math.max(0, maxQr));
  return { verifiable, total, shown, more: total - shown };
}
