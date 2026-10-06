import { describe, it, expect } from "vitest";
import { filterDeletableDocuments } from "../deleteEligibility";

/** 1回の応答を pageCap 行で切る PostgREST もどき（id 順・gt でキーセット）。 */
function cappedClient(tables: Record<string, { id: string; document_id: string }[]>, pageCap: number) {
  return {
    from(table: string) {
      const all = [...(tables[table] ?? [])].sort((a, b) => a.id.localeCompare(b.id));
      let after: string | null = null;
      let ids: string[] = [];
      const b = {
        select: () => b,
        in: (_c: string, v: string[]) => {
          ids = v;
          return b;
        },
        eq: () => b,
        order: () => b,
        limit: () => b,
        gt: (_c: string, v: string) => {
          after = v;
          return b;
        },
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: all.filter((r) => ids.includes(r.document_id) && (!after || r.id > after)).slice(0, pageCap),
            error: null,
          }).then(res),
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

  it("帳票 ID を分けて問い合わせても、後ろの塊にある入金記録を拾う", async () => {
    const docs = Array.from({ length: 150 }, (_, i) => sent(`doc-${String(i).padStart(3, "0")}`));
    const client = cappedClient({ payment_entries: [{ id: "p1", document_id: "doc-130" }], billing_splits: [] }, 1000);

    const { eligible } = await filterDeletableDocuments(client as never, "t1", docs, true);

    expect(eligible).toHaveLength(149);
    expect(eligible.some((d) => d.id === "doc-130")).toBe(false);
  });

  it("管理者未満・オーダー締めの送付済み合算請求書は外し、下書きはそのまま通す", async () => {
    const client = cappedClient({}, 1000);
    const cycle = { ...sent("doc-cycle"), meta_json: { source: "job_order_cycle" } };
    const draft = { id: "doc-draft", doc_type: "consolidated_invoice", status: "draft", meta_json: {} };

    expect((await filterDeletableDocuments(client as never, "t1", [cycle, draft], true)).eligible).toEqual([draft]);
    // 以前の編集で meta_json.source が消えたオーダー締め合算も、counterparty_tenant_id で見分けて外す
    const legacyCycle = { ...sent("doc-legacy"), counterparty_tenant_id: "tenant-from" };
    expect((await filterDeletableDocuments(client as never, "t1", [legacyCycle], true)).eligible).toEqual([]);
    expect((await filterDeletableDocuments(client as never, "t1", [sent("x"), draft], false)).eligible).toEqual([
      draft,
    ]);
  });
});
