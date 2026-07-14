/**
 * 登録車両とフリーテキストの照合 — 純粋ロジック。
 *
 * quoteDraftCore.ts / inboundAuto.ts に同種のインライン照合が既にあるが、
 * 判定基準がわずかに異なる (前者は複数候補中の最初の一致、後者は「登録車両が
 * ちょうど1台のときだけ」)。ここでは「曖昧なら紐付けない」を徹底し、
 * 一致した車両が複数あれば誤紐付けを避けて null を返す共通版として新設する。
 */
export interface VehicleTextCandidate {
  id: string;
  maker: string | null;
  model: string | null;
  plate_display: string | null;
}

/**
 * `text` (問い合わせ本文などの自由記述) が候補車両のメーカー・車種・ナンバーの
 * いずれかを含む車両を探す。一致が 1 台だけなら返す。0 台または複数台の一致は
 * 誤紐付けのリスクがあるため null (呼び出し側は紐付けをスキップする)。
 */
export function matchVehicleByText<T extends VehicleTextCandidate>(vehicles: T[], text: string): T | null {
  const haystack = text.trim().toLowerCase();
  if (!haystack) return null;

  const matches = vehicles.filter((v) =>
    [v.maker, v.model, v.plate_display]
      .filter((t): t is string => !!t && t.trim().length >= 2)
      .some((t) => haystack.includes(t.toLowerCase())),
  );
  return matches.length === 1 ? matches[0] : null;
}
