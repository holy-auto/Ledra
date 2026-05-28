import { describe, it, expect } from "vitest";
import { ruleValidate } from "../intakeValidator";

describe("ruleValidate", () => {
  it("passes a well-formed submission", () => {
    const issues = ruleValidate({
      name: "山田 太郎",
      email: "yamada@example.com",
      phone: "090-1234-5678",
      postal_code: "150-0043",
      address: "東京都渋谷区道玄坂1-2-3",
      birth_date: "1990-01-23",
    });
    expect(issues).toHaveLength(0);
  });

  it("flags missing name as error", () => {
    const issues = ruleValidate({ name: "" });
    expect(issues.some((i) => i.field === "name" && i.severity === "error")).toBe(true);
  });

  it("warns on obvious dummy name", () => {
    const issues = ruleValidate({ name: "asdfasdf" });
    expect(issues.some((i) => i.field === "name" && i.severity === "warning")).toBe(true);
  });

  it("does not warn on a real-looking name", () => {
    const issues = ruleValidate({ name: "佐藤 健" });
    expect(issues.some((i) => i.field === "name")).toBe(false);
  });

  it("flags invalid postal_code as warning", () => {
    const issues = ruleValidate({ name: "山田", postal_code: "abc" });
    expect(issues.some((i) => i.field === "postal_code" && i.severity === "warning")).toBe(true);
  });

  it("accepts postal_code with or without hyphen", () => {
    expect(ruleValidate({ name: "山田", postal_code: "1500043" })).toHaveLength(0);
    expect(ruleValidate({ name: "山田", postal_code: "150-0043" })).toHaveLength(0);
  });

  it("flags birth_date in the future as warning", () => {
    const issues = ruleValidate({ name: "山田", birth_date: "2099-01-01" });
    expect(issues.some((i) => i.field === "birth_date" && i.severity === "warning")).toBe(true);
  });

  it("flags birth_date before 1900 as warning", () => {
    const issues = ruleValidate({ name: "山田", birth_date: "1800-01-01" });
    expect(issues.some((i) => i.field === "birth_date" && i.severity === "warning")).toBe(true);
  });

  it("flags malformed email", () => {
    const issues = ruleValidate({ name: "山田", email: "not-an-email" });
    expect(issues.some((i) => i.field === "email" && i.severity === "warning")).toBe(true);
  });

  it("accepts 10-digit and 11-digit phone numbers", () => {
    expect(ruleValidate({ name: "山田", phone: "0312345678" })).toHaveLength(0);
    expect(ruleValidate({ name: "山田", phone: "090-1234-5678" })).toHaveLength(0);
  });

  it("flags phone with too few digits", () => {
    const issues = ruleValidate({ name: "山田", phone: "123" });
    expect(issues.some((i) => i.field === "phone" && i.severity === "warning")).toBe(true);
  });

  it("flags address missing prefecture+municipality", () => {
    const issues = ruleValidate({ name: "山田", address: "どこか" });
    expect(issues.some((i) => i.field === "address" && i.severity === "warning")).toBe(true);
  });

  it("rejects my-number in any field as error", () => {
    const issues = ruleValidate({ name: "山田 太郎", note: "1234 5678 9012" });
    expect(issues.some((i) => i.field === "note" && i.severity === "error")).toBe(true);
  });

  it("does not false-positive on a phone number for my-number", () => {
    const issues = ruleValidate({ name: "山田", phone: "090-1234-5678" });
    expect(issues.some((i) => i.message.includes("個人番号"))).toBe(false);
  });
});
