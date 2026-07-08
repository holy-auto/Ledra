import { describe, it, expect } from "vitest";
import { nextInvoiceNumber, nextDocNumber, invoiceYm } from "@/lib/invoice/invoiceNumber";

/**
 * 採番の数値ソート（999→1000 の桁上がり）と JST 月導出を検証する。
 * DB は使わず、documents クエリチェーンをモックする。
 */
function mockAdmin(rows: Array<{ doc_number: string }>) {
  const chain = {
    eq: () => chain,
    like: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    from: () => ({ select: () => chain }),
  } as never;
}

describe("nextInvoiceNumber", () => {
  it("採番が空なら 001", async () => {
    const n = await nextInvoiceNumber(mockAdmin([]), "t1", "202607");
    expect(n).toBe("INV-202607-001");
  });

  it("末尾を数値として最大化する（文字列ソートなら 999 で止まるが 1000 を返す）", async () => {
    const n = await nextInvoiceNumber(
      mockAdmin([{ doc_number: "INV-202607-999" }, { doc_number: "INV-202607-1000" }]),
      "t1",
      "202607",
    );
    expect(n).toBe("INV-202607-1001");
  });

  it("999 の次は 1000（3 桁を超えても切り詰めない）", async () => {
    const n = await nextInvoiceNumber(mockAdmin([{ doc_number: "INV-202607-999" }]), "t1", "202607");
    expect(n).toBe("INV-202607-1000");
  });

  it("3 桁未満はゼロ詰めする", async () => {
    const n = await nextInvoiceNumber(mockAdmin([{ doc_number: "INV-202607-004" }]), "t1", "202607");
    expect(n).toBe("INV-202607-005");
  });
});

describe("nextDocNumber（見積・領収書など invoice 以外）", () => {
  it("prefix を差し替えて採番する", async () => {
    const n = await nextDocNumber(mockAdmin([{ doc_number: "EST-202607-012" }]), "t1", "estimate", "EST", "202607");
    expect(n).toBe("EST-202607-013");
  });

  it("文字列ソートで止まる 999→1000 の桁上がりも数値で処理する", async () => {
    const n = await nextDocNumber(
      mockAdmin([{ doc_number: "RCP-202607-999" }, { doc_number: "RCP-202607-1000" }]),
      "t1",
      "receipt",
      "RCP",
      "202607",
    );
    expect(n).toBe("RCP-202607-1001");
  });
});

describe("invoiceYm (JST)", () => {
  it("UTC 深夜は翌日 JST の月に寄せる", () => {
    // UTC 2026-06-30 15:30 = JST 2026-07-01 00:30 → 202607
    expect(invoiceYm(new Date("2026-06-30T15:30:00Z"))).toBe("202607");
  });

  it("UTC 昼は同日 JST の月", () => {
    // UTC 2026-07-01 03:00 = JST 2026-07-01 12:00 → 202607
    expect(invoiceYm(new Date("2026-07-01T03:00:00Z"))).toBe("202607");
  });
});
