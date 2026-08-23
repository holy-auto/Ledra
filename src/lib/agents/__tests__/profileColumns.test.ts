import { describe, it, expect } from "vitest";

import { AGENT_PROFILE_COLUMNS, toAgentPatch } from "../profileColumns";

describe("AGENT_PROFILE_COLUMNS", () => {
  it("agents に無い列を含まない（1つでも混ざるとクエリごと失敗する）", () => {
    const cols = AGENT_PROFILE_COLUMNS.split(",").map((c) => c.trim());
    for (const gone of [
      "company_name",
      "company_address",
      "website_url",
      "logo_url",
      "commission_rate",
      "bank_name",
      "bank_branch",
      "bank_account_type",
      "bank_account_number",
      "bank_account_holder",
      "email",
      "phone",
      "industry",
    ]) {
      expect(cols).not.toContain(gone);
    }
    expect(cols).toContain("name");
    expect(cols).toContain("address");
    expect(cols).toContain("logo_asset_path");
    expect(cols).toContain("default_commission_rate");
  });
});

describe("toAgentPatch", () => {
  it("画面の項目名を agents の実列に置き換える", () => {
    expect(toAgentPatch({ name: "A社", company_address: "東京都", logo_url: "x", commission_rate: 12 })).toEqual({
      patch: { name: "A社", address: "東京都", logo_asset_path: "x", default_commission_rate: 12 },
      unsupported: [],
    });
  });

  it("保存先の無い項目は patch に入れず、日本語の名前で返す（黙って捨てない）", () => {
    const { patch, unsupported } = toAgentPatch({ bank_name: "みずほ", website_url: "https://x.test" });
    expect(patch).toEqual({});
    expect(unsupported).toEqual(["銀行名", "ウェブサイト"]);
  });

  it("保存できる項目と保存できない項目が混ざったら、保存できない方を報告する", () => {
    const { patch, unsupported } = toAgentPatch({ name: "A社", bank_account_number: "123" });
    expect(patch).toEqual({ name: "A社" });
    expect(unsupported).toEqual(["口座番号"]);
  });

  it("undefined の項目は patch に入れない（未指定と空を混同しない）", () => {
    expect(toAgentPatch({ name: "A社", contact_name: undefined }).patch).toEqual({ name: "A社" });
  });

  it("画面が `address` を送っても `company_address` を送っても agents.address に入る", () => {
    expect(toAgentPatch({ address: "東京都" }).patch).toEqual({ address: "東京都" });
    expect(toAgentPatch({ company_address: "東京都" }).patch).toEqual({ address: "東京都" });
  });

  it("保存先の無い項目が空のまま送られても保存操作は止めない（画面は毎回全項目を送る）", () => {
    const { patch, unsupported } = toAgentPatch({ name: "A社", postal_code: "", bank_name: "" });
    expect(patch).toEqual({ name: "A社" });
    expect(unsupported).toEqual([]);
  });

  it("保存先の無い項目に中身があるときは保存できないと返す", () => {
    expect(toAgentPatch({ postal_code: "150-0001" }).unsupported).toEqual(["郵便番号"]);
    expect(toAgentPatch({ email_notifications: true }).unsupported).toEqual(["メール通知"]);
  });

  it("保存できない項目と実列の対応表が重ならない（重なると片方が黙って消える）", () => {
    const { patch, unsupported } = toAgentPatch({
      name: "A社",
      contact_email: "a@example.test",
      contact_phone: "090",
      contact_name: "担当",
      notes: "メモ",
      commission_type: "rate",
      company_address: "東京都",
      logo_url: "logo",
      commission_rate: 5,
    });
    expect(unsupported).toEqual([]);
    expect(Object.keys(patch).sort()).toEqual(
      [
        "address",
        "commission_type",
        "contact_email",
        "contact_name",
        "contact_phone",
        "default_commission_rate",
        "logo_asset_path",
        "name",
        "notes",
      ].sort(),
    );
  });
});
