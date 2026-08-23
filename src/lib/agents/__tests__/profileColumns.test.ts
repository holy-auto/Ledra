import { describe, it, expect } from "vitest";

import { AGENT_PROFILE_COLUMNS, toAgentPatch } from "../profileColumns";

describe("AGENT_PROFILE_COLUMNS", () => {
  it("agents に無い列を含まない（1つでも混ざるとクエリごと失敗する）", () => {
    const cols = AGENT_PROFILE_COLUMNS.split(",").map((c) => c.trim());
    for (const gone of [
      "company_name",
      "company_address",
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
    expect(cols).toContain("postal_code");
    expect(cols).toContain("website_url");
    expect(cols).toContain("bank_info");
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
    const { patch, unsupported } = toAgentPatch({ company_name: "A株式会社", email_notifications: true });
    expect(patch).toEqual({});
    expect(unsupported).toEqual(["会社名", "メール通知"]);
  });

  it("保存できる項目と保存できない項目が混ざったら、保存できない方を報告する", () => {
    const { patch, unsupported } = toAgentPatch({ name: "A社", company_name: "A株式会社" });
    expect(patch).toEqual({ name: "A社" });
    expect(unsupported).toEqual(["会社名"]);
  });

  describe("振込先（bank_info）", () => {
    it("画面の bank_* を1つの jsonb にまとめる", () => {
      expect(
        toAgentPatch({
          bank_name: "みずほ銀行",
          bank_branch: "渋谷支店",
          bank_account_type: "ordinary",
          bank_account_number: "1234567",
          bank_account_holder: "カ)ホーリー",
        }).patch,
      ).toEqual({
        bank_info: {
          bank_name: "みずほ銀行",
          branch: "渋谷支店",
          account_type: "ordinary",
          account_number: "1234567",
          account_holder: "カ)ホーリー",
        },
      });
    });

    it("1項目だけ更新しても既存の他の項目が消えない", () => {
      const current = { bank_name: "みずほ銀行", branch: "渋谷支店", account_number: "1234567" };
      expect(toAgentPatch({ bank_branch: "新宿支店" }, current).patch).toEqual({
        bank_info: { bank_name: "みずほ銀行", branch: "新宿支店", account_number: "1234567" },
      });
    });

    it("空文字を送るとその項目だけ消える（他は残る）", () => {
      const current = { bank_name: "みずほ銀行", branch: "渋谷支店" };
      expect(toAgentPatch({ bank_branch: "" }, current).patch).toEqual({
        bank_info: { bank_name: "みずほ銀行" },
      });
    });

    it("全部空にしたら bank_info ごと null にする（空オブジェクトを残さない）", () => {
      expect(toAgentPatch({ bank_name: "" }, { bank_name: "みずほ銀行" }).patch).toEqual({ bank_info: null });
    });

    it("振込先に触れていなければ bank_info を patch に入れない（意図しない上書きを避ける）", () => {
      const { patch } = toAgentPatch({ name: "A社" }, { bank_name: "みずほ銀行" });
      expect(patch).toEqual({ name: "A社" });
      expect(patch).not.toHaveProperty("bank_info");
    });
  });

  it("undefined の項目は patch に入れない（未指定と空を混同しない）", () => {
    expect(toAgentPatch({ name: "A社", contact_name: undefined }).patch).toEqual({ name: "A社" });
  });

  it("画面が `address` を送っても `company_address` を送っても agents.address に入る", () => {
    expect(toAgentPatch({ address: "東京都" }).patch).toEqual({ address: "東京都" });
    expect(toAgentPatch({ company_address: "東京都" }).patch).toEqual({ address: "東京都" });
  });

  it("保存先の無い項目が空のまま送られても保存操作は止めない（画面は毎回全項目を送る）", () => {
    const { patch, unsupported } = toAgentPatch({ name: "A社", company_name: "", email_notifications: false });
    expect(patch).toEqual({ name: "A社" });
    expect(unsupported).toEqual([]);
  });

  it("郵便番号とウェブサイトは実列に入る", () => {
    expect(toAgentPatch({ postal_code: "150-0001", website_url: "https://x.test" }).patch).toEqual({
      postal_code: "150-0001",
      website_url: "https://x.test",
    });
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
