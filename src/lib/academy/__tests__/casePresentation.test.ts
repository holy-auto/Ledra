/**
 * 公開事例の一覧は**他店の事例も含む**（全加盟店共有ライブラリ）。
 * ここが漏れると、匿名化したはずの事例からどの店のものかが分かる。
 */
import { describe, it, expect } from "vitest";
import { presentAcademyCases, academyCaseToken, type AcademyCaseRow } from "@/lib/academy/casePresentation";

const MINE = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function row(tenantId: string, over: Partial<AcademyCaseRow> = {}): AcademyCaseRow {
  return {
    tenant_id: tenantId,
    // id にテナント UUID を埋めない。埋めると下の「値として残っていない」検査が
    // 実装ではなくフィクスチャで落ちる（最初にそれで落ちた）。
    id: tenantId === MINE ? "case-mine" : "case-other",
    category: "coating",
    ai_summary: "要約",
    good_points: ["良かった点"],
    caution_points: ["注意点"],
    vehicle_info: { maker: "トヨタ" },
    ...over,
  };
}

describe("presentAcademyCases", () => {
  it("tenant_id を応答に載せない（匿名化の境界）", () => {
    const out = presentAcademyCases([row(MINE), row(OTHER)], { tenantId: MINE, maskKnowHow: false });
    for (const c of out) {
      expect(Object.keys(c)).not.toContain("tenant_id");
    }
    // 値としても残っていないこと。列名を変えて回避される形も潰す。
    expect(JSON.stringify(out)).not.toContain(OTHER);
  });

  it("自店の事例だけ is_own が true（非公開ボタンの出し分け）", () => {
    const [mine, other] = presentAcademyCases([row(MINE), row(OTHER)], { tenantId: MINE, maskKnowHow: false });
    expect(mine.is_own).toBe(true);
    expect(other.is_own).toBe(false);
  });

  it("ノウハウ詳細のマスクは4項目すべてに掛かる", () => {
    const [c] = presentAcademyCases([row(OTHER)], { tenantId: MINE, maskKnowHow: true });
    expect(c.ai_summary).toBeNull();
    expect(c.good_points).toEqual([]);
    expect(c.caution_points).toEqual([]);
    expect(c.vehicle_info).toEqual({});
    // マスクしても所有判定は消えない（自店の事例なら非公開に戻せる）。
    expect(c.is_own).toBe(false);
  });

  it("マスクしないときはノウハウをそのまま通す", () => {
    const [c] = presentAcademyCases([row(OTHER)], { tenantId: MINE, maskKnowHow: false });
    expect(c.ai_summary).toBe("要約");
    expect(c.good_points).toEqual(["良かった点"]);
  });

  it("知らない列はそのまま通す（列が増えても落とさない）", () => {
    const [c] = presentAcademyCases([row(MINE, { quality_score: 92 })], { tenantId: MINE, maskKnowHow: false });
    expect(c.quality_score).toBe(92);
  });
});

/**
 * 公開の確認が「今も有効か」を表す印。preview が返し、publish が突き合わせる。
 *
 * ここは**構造テストでは捕まらなかった**。publishGate.test.ts はハッシュに
 * `updated_at` が入っているかしか見ておらず、preview → publish の往復で
 * 同じ印になるかを一度も確かめていなかった。実際には preview が JS の
 * `toISOString()`（`...Z`）を、publish が DB の返す `+00:00` をハッシュしていて、
 * **すべての公開が弾かれる**状態だった（Codex の指摘）。
 */
describe("academyCaseToken", () => {
  const base = {
    ai_summary: "要約",
    good_points: ["良かった点"],
    caution_points: ["注意点"],
    tags: ["coating"],
    // DB（PostgREST）が timestamptz を返すときの形。
    updated_at: "2026-09-05T12:00:00.123+00:00",
  };

  it("印は5項目だけで決まる（片側の select に列が増えても揺れない）", () => {
    // preview と publish は別々の select で行を取る。行そのものをハッシュすると、
    // 片方の select に列を1つ足しただけで印が合わなくなる。**列名を明示して混ぜる**
    // ことで、両側の select がずれても印は動かない。
    const withExtras = { ...base, id: "case-1", is_published: false, quality_score: 92 };
    expect(academyCaseToken(withExtras)).toBe(academyCaseToken(base));
  });

  it("文面が入れ替わると切れる（別の人が再生成した）", () => {
    expect(academyCaseToken({ ...base, ai_summary: "別の要約" })).not.toBe(academyCaseToken(base));
  });

  it("updated_at が動くと切れる（公開→非公開で本文が同じでも再確認させる）", () => {
    expect(academyCaseToken({ ...base, updated_at: "2026-09-05T12:00:00.124+00:00" })).not.toBe(academyCaseToken(base));
  });

  it("同じ時刻でも表記が違えば別の印になる", () => {
    // だから preview は**送った値ではなく DB が返した値**をハッシュしなければならない。
    // 下の2つは同じ瞬間だが、文字列が違うので印は一致しない。
    expect(academyCaseToken({ ...base, updated_at: "2026-09-05T12:00:00.123Z" })).not.toBe(
      academyCaseToken({ ...base, updated_at: "2026-09-05T12:00:00.123+00:00" }),
    );
  });
});
