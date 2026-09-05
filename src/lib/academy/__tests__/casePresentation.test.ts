/**
 * 公開事例の一覧は**他店の事例も含む**（全加盟店共有ライブラリ）。
 * ここが漏れると、匿名化したはずの事例からどの店のものかが分かる。
 */
import { describe, it, expect } from "vitest";
import { presentAcademyCases, type AcademyCaseRow } from "@/lib/academy/casePresentation";

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
