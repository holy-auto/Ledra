/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 研修・施工条件の作成は、body の project_id が呼び出し元メーカーのプロジェクトかを確かめる
 * （recruitments / jobs と同じ確認）。確かめないと、他社プロジェクトの施工店画面に研修や条件を差し込める。
 * あわせて研修の content_url は施工店側で <a href> に出るので http(s) 以外を通さない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ME = "mfr-me";
const OTHER = "mfr-other";
const MY_PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const PROJECT_OWNER: Record<string, string> = { [MY_PROJECT]: ME, [OTHER_PROJECT]: OTHER };

const inserts: { table: string; row: any }[] = [];

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/manufacturerCaller", () => ({
  resolveManufacturerCaller: vi.fn(async () => ({ manufacturerId: ME, role: "admin" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => ((filters[k] = v), q),
        maybeSingle: async () => {
          const owner = PROJECT_OWNER[filters.id];
          const hit = owner && (!filters.manufacturer_id || filters.manufacturer_id === owner);
          return { data: hit ? { id: filters.id } : null, error: null };
        },
        insert: (row: any) => {
          inserts.push({ table, row });
          return { select: () => ({ single: async () => ({ data: { id: "new", ...row }, error: null }) }) };
        },
      };
      return q;
    },
  }),
}));

import { POST as trainingPOST } from "../route";
import { POST as conditionsPOST } from "../../conditions/route";

const req = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }) as any;

beforeEach(() => {
  inserts.length = 0;
});

describe("field-test 研修・施工条件の作成 — プロジェクト所有確認", () => {
  for (const [name, POST, body] of [
    ["training", trainingPOST, { title: "研修" }],
    ["conditions", conditionsPOST, { label: "条件" }],
  ] as const) {
    it(`${name}: 他社のプロジェクトには作らない`, async () => {
      const res = await POST(req({ ...body, project_id: OTHER_PROJECT }));
      expect(res.status).toBe(404);
      expect(inserts).toEqual([]);
    });

    it(`${name}: 自社のプロジェクトには作る`, async () => {
      const res = await POST(req({ ...body, project_id: MY_PROJECT }));
      expect(res.status).toBe(200);
      expect(inserts).toHaveLength(1);
      expect(inserts[0].row).toMatchObject({ project_id: MY_PROJECT, manufacturer_id: ME });
    });
  }

  it("training: content_url は http(s) だけを通す", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x"]) {
      const res = await trainingPOST(req({ title: "研修", project_id: MY_PROJECT, content_url: url }));
      expect(res.status).toBe(400);
    }
    expect(inserts).toEqual([]);
    const ok = await trainingPOST(req({ title: "研修", project_id: MY_PROJECT, content_url: "https://example.com/v" }));
    expect(ok.status).toBe(200);
  });
});
