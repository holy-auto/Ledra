import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { syncConsolidatedSources } from "../consolidatedSupersede";
import { consolidatedInto } from "@/types/document";

type Row = { id: string; tenant_id: string; doc_type: string; status: string; meta_json: Record<string, unknown> };

/** documents の行配列に eq / in を当てて select / update する素朴な偽 DB（JSON の `->>` だけ読む）。 */
function fakeDb(rows: Row[]) {
  const get = (r: Row, col: string) => {
    const [c, key] = col.split("->>");
    return key ? (r[c as keyof Row] as Record<string, unknown>)?.[key] : r[c as keyof Row];
  };
  return {
    rows,
    from: () => {
      const preds: ((r: Row) => boolean)[] = [];
      let patch: Partial<Row> | null = null;
      const b = {
        select: () => b,
        update: (p: Partial<Row>) => {
          patch = p;
          return b;
        },
        eq: (col: string, v: unknown) => {
          preds.push((r) => get(r, col) === v);
          return b;
        },
        in: (col: string, vs: unknown[]) => {
          preds.push((r) => vs.includes(get(r, col)));
          return b;
        },
        then: (res: (v: { data: Row[]; error: null }) => unknown) => {
          const hit = rows.filter((r) => preds.every((p) => p(r)));
          if (patch) for (const r of hit) Object.assign(r, patch);
          return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(res);
        },
      };
      return b;
    },
  };
}

const row = (id: string, doc_type: string, status: string, tenant_id = "t1"): Row => ({
  id,
  tenant_id,
  doc_type,
  status,
  meta_json: { note: id },
});

const cinv = (status: string) => ({
  id: "cinv",
  doc_type: "consolidated_invoice",
  status,
  meta_json: { source_document_ids: ["inv-sent", "inv-overdue", "inv-paid", "dlv", "other-tenant"] },
});

describe("syncConsolidatedSources（合算請求書と元請求書の二重計上を防ぐ）", () => {
  const seed = () =>
    fakeDb([
      row("inv-sent", "invoice", "sent"),
      row("inv-overdue", "invoice", "overdue"),
      row("inv-paid", "invoice", "paid"),
      row("dlv", "delivery", "sent"),
      row("other-tenant", "invoice", "sent", "t2"),
    ]);
  const status = (db: ReturnType<typeof seed>) => Object.fromEntries(db.rows.map((r) => [r.id, r.status]));

  it("作成したら未入金の元請求書だけを取消扱いにし、まとめ先を残す（入金済・納品書・他テナントは触らない）", async () => {
    const db = seed();
    await syncConsolidatedSources(db as never, "t1", cinv("draft"));

    expect(status(db)).toEqual({
      "inv-sent": "cancelled",
      "inv-overdue": "cancelled",
      "inv-paid": "paid",
      dlv: "sent",
      "other-tenant": "sent",
    });
    const sent = db.rows.find((r) => r.id === "inv-sent")!;
    expect(consolidatedInto(sent.meta_json)).toBe("cinv");
    expect(sent.meta_json.note).toBe("inv-sent");
  });

  it("合算請求書を取消・削除したら元のステータスへ戻し、印を外す。取消の取り消しでまた取消扱いに戻る", async () => {
    const db = seed();
    await syncConsolidatedSources(db as never, "t1", cinv("sent"));
    await syncConsolidatedSources(db as never, "t1", cinv("cancelled"));

    expect(status(db)).toMatchObject({ "inv-sent": "sent", "inv-overdue": "overdue" });
    expect(db.rows.find((r) => r.id === "inv-sent")!.meta_json).toEqual({ note: "inv-sent" });

    await syncConsolidatedSources(db as never, "t1", cinv("sent"));
    expect(status(db)).toMatchObject({ "inv-sent": "cancelled", "inv-overdue": "cancelled" });

    await syncConsolidatedSources(db as never, "t1", cinv("sent"), { deleted: true });
    expect(status(db)).toMatchObject({ "inv-sent": "sent", "inv-overdue": "overdue" });
  });

  it("合算請求書以外では何もしない", async () => {
    const db = seed();
    await syncConsolidatedSources(db as never, "t1", { ...cinv("sent"), doc_type: "invoice" });
    expect(status(db)["inv-sent"]).toBe("sent");
  });
});
