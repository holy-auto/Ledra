import { describe, it, expect } from "vitest";
import { filterDeletableDocuments } from "../deleteEligibility";

/** 1回の応答を pageCap 行で切る PostgREST もどき（id 順・gt でキーセット）。 */
function cappedClient(tables: Record<string, { id: string; document_id: string }[]>, pageCap: number) {
  return {
    from(table: string) {
      const all = [...(tables[table] ?? [])].sort((a, b) => a.id.localeCompare(b.id));
      let after: string | null = null;
      const b = {
        select: () => b,
        in: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        gt: (_c: string, v: string) => {
          after = v;
          return b;
        },
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: all.filter((r) => !after || r.id > after).slice(0, pageCap), error: null }).then(res),
      };
      return b;
    },
  };
}

const sent = (id: string) => ({ id, doc_type: "consolidated_invoice", status: "sent", meta_json: {} });

describe("filterDeletableDocuments", () => {
  it("応答の行数上限を超えて並ぶ入金記録の帳票も、削除対象から外す", async () => {
    // doc-a の入金が 5 行あり、上限 2 行のサーバでは doc-b の入金は 3 ページ目に来る
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, document_id: "doc-a" })),
      { id: "p9", document_id: "doc-b" },
    ];
    const client = cappedClient({ payment_entries: entries, billing_splits: [] }, 2);

    const { eligible } = await filterDeletableDocuments(
      client as never,
      "t1",
      [sent("doc-a"), sent("doc-b"), sent("doc-c")],
      true,
    );

    expect(eligible.map((d) => d.id)).toEqual(["doc-c"]);
  });

  it("管理者未満・オーダー締めの送付済み合算請求書は外し、下書きはそのまま通す", async () => {
    const client = cappedClient({}, 1000);
    const cycle = { ...sent("doc-cycle"), meta_json: { source: "job_order_cycle" } };
    const draft = { id: "doc-draft", doc_type: "consolidated_invoice", status: "draft", meta_json: {} };

    expect((await filterDeletableDocuments(client as never, "t1", [cycle, draft], true)).eligible).toEqual([draft]);
    expect((await filterDeletableDocuments(client as never, "t1", [sent("x"), draft], false)).eligible).toEqual([
      draft,
    ]);
  });
});
