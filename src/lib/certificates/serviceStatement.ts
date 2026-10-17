/**
 * 証明書 PDF の DECLARATION（冒頭文）。
 *
 * **根拠の節だけ**を `anchored` で切り替える。刻印が無い証明書に
 * 「Polygon ブロックチェーンに刻印された改ざん不可能な記録」と書くと、
 * 事実と違う文がそのまま顧客の手元に残る。本番の実測（2026-10-17）では証明書 70 件に対し
 * 刻印は 11 件で、その 11 件はすべて撮影用のデモテナント（`ledra-motors-demo`）のものだった。
 * つまり実テナントの証明書は1件も刻印されていないのに、70 件全部にこの文が載っていた。
 *
 * `@react-pdf` も `Font.register`（約 4.7MB の TTF を base64 化する）も要らない純関数なので、
 * `pdfCertificate.tsx` から分けてある（文言のテストがフォントの読み込みを引き連れないため）。
 */

/**
 * @param serviceType `certificates.service_type`。未知の値・未設定は汎用の主語に落ちる。
 * @param anchored その証明書について、**PDF が根拠として示せる**刻印があるか。
 *   呼び出し側は「PDF に QR を載せられるアンカーの件数 > 0」を渡す。tx hash の有無だけで
 *   判定すると、ネットワークが不明で QR を出せない行まで「刻印あり」になり、
 *   **根拠を示さないまま刻印を主張する**ことになる（`/code-review` の指摘。2026-10-17）。
 */
export function buildServiceStatement(serviceType: string | null | undefined, anchored: boolean): string {
  const subject =
    serviceType === "ppf"
      ? "ペイントプロテクションフィルム (PPF) の施工が完了した事実"
      : serviceType === "maintenance"
        ? "整備作業が実施された事実"
        : serviceType === "body_repair"
          ? "鈑金塗装作業が実施された事実"
          : serviceType === "accessory"
            ? "用品取付作業が実施された事実"
            : "施工作業が完了した事実";
  // ponytail: 刻印が無いときの根拠は「写真と作業内容」までに留める。ハッシュを根拠に挙げないのは、
  // PDF がハッシュを載せるのは刻印済みの QR ブロックだけなので、ハッシュに言及すると文書自身が
  // 裏付けを持たない主張になるため。刻印が無くてもハッシュを表に出す設計にするなら、
  // その時点でここも「写真とそのハッシュ」に広げられる。
  const basis = anchored
    ? "Polygon ブロックチェーンに刻印された改ざん不可能な記録として"
    : "施工時に記録された写真と作業内容に基づいて";
  return `本証明書は、下記車両に対して${subject}を、${basis}証明するものです。`;
}
