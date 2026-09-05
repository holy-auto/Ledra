/**
 * Academy 事例を API 応答の形にする。
 *
 * 公開事例は**全加盟店で共有するライブラリ**（2026-09-05 代表判断）。一覧には他店の
 * 事例も並ぶので、ここが2つの境界を同時に持つ。
 *
 * 1. **匿名化** — 公開時に `anonymized: true` を立てている以上、どの店の事例かは
 *    出してはいけない。`tenant_id` を応答に載せない。
 * 2. **所有判定** — 「非公開に戻す」は自店の事例にしか出せない。クライアントに
 *    `tenant_id` を渡して比べさせると 1 を破るので、**サーバで真偽値にしてから渡す**。
 *
 * 3つ目にプラン制限のマスクも同じ場所で掛ける。ノウハウ詳細は有料プラン限定で、
 * 自店の候補事例は自分のデータなので対象外（呼び出し側が `maskKnowHow` で決める）。
 */

/** 事例1件のうち、この関数が触る列だけを型にする。他の列はそのまま通す。 */
export type AcademyCaseRow = {
  tenant_id: string;
  ai_summary: string | null;
  good_points: unknown;
  caution_points: unknown;
  vehicle_info: unknown;
} & Record<string, unknown>;

export type PresentedAcademyCase = Record<string, unknown> & { is_own: boolean };

export function presentAcademyCases(
  rows: readonly AcademyCaseRow[],
  opts: { tenantId: string; maskKnowHow: boolean },
): PresentedAcademyCase[] {
  return rows.map((row) => {
    // 分割代入で tenant_id を落とす。スプレッドの後に上書きする形にすると、
    // 列が増えたときに載せ忘れではなく**漏らし**になる（消す方を明示する）。
    const { tenant_id, ...rest } = row;
    const presented: PresentedAcademyCase = { ...rest, is_own: tenant_id === opts.tenantId };
    if (opts.maskKnowHow) {
      presented.ai_summary = null;
      presented.good_points = [];
      presented.caution_points = [];
      presented.vehicle_info = {};
    }
    return presented;
  });
}
