import { describe, it, expect } from "vitest";
import { evaluateQualityFlags, type QualityEvalInput } from "../qualityFlags";

const clean: QualityEvalInput = {
  customer_name: "山田太郎",
  content_free_text: "コーティング施工",
  warranty_period_end: "2027-01-01",
  warranty_exclusions: null,
  coating_products_json: [{ name: "X" }],
  ppf_coverage_json: [],
  maintenance_json: {},
  body_repair_json: {},
  image_count: 3,
};

describe("evaluateQualityFlags", () => {
  it("returns no flags for a complete certificate", () => {
    expect(evaluateQualityFlags(clean)).toEqual([]);
  });

  it("flags missing photos", () => {
    expect(evaluateQualityFlags({ ...clean, image_count: 0 })).toContain("no_photos");
  });

  it("flags missing warranty when both fields blank", () => {
    expect(evaluateQualityFlags({ ...clean, warranty_period_end: null, warranty_exclusions: "" })).toContain(
      "no_warranty",
    );
  });

  it("does not flag warranty when only exclusions present", () => {
    expect(
      evaluateQualityFlags({
        ...clean,
        warranty_period_end: null,
        warranty_exclusions: "経年劣化は対象外",
      }),
    ).not.toContain("no_warranty");
  });

  it("flags missing service detail only when all sources empty", () => {
    const r = evaluateQualityFlags({
      ...clean,
      content_free_text: "  ",
      coating_products_json: [],
      ppf_coverage_json: [],
      maintenance_json: {},
      body_repair_json: {},
    });
    expect(r).toContain("no_service_detail");
  });

  it("still flags missing service detail when maintenance_json holds only the mileage", () => {
    // 2026-08-25 以降、走行距離は施工種別を問わず maintenance_json に必ず入る。
    // これを施工内容とみなすと no_service_detail がどの証明書でも立たなくなる。
    const r = evaluateQualityFlags({
      ...clean,
      content_free_text: "  ",
      coating_products_json: [],
      ppf_coverage_json: [],
      maintenance_json: { mileage: 35000 },
      body_repair_json: {},
    });
    expect(r).toContain("no_service_detail");
  });

  it("does not flag service detail when maintenance_json has real content alongside the mileage", () => {
    const r = evaluateQualityFlags({
      ...clean,
      content_free_text: "",
      coating_products_json: [],
      ppf_coverage_json: [],
      maintenance_json: { mileage: 35000, work_types: ["oil_change"] },
      body_repair_json: {},
    });
    expect(r).not.toContain("no_service_detail");
  });

  it("does not flag service detail when ppf coverage present", () => {
    const r = evaluateQualityFlags({
      ...clean,
      content_free_text: "",
      coating_products_json: [],
      ppf_coverage_json: [{ panel: "hood" }],
      maintenance_json: {},
      body_repair_json: {},
    });
    expect(r).not.toContain("no_service_detail");
  });

  it("flags blank customer name", () => {
    expect(evaluateQualityFlags({ ...clean, customer_name: "   " })).toContain("no_customer_name");
    expect(evaluateQualityFlags({ ...clean, customer_name: null })).toContain("no_customer_name");
  });

  it("can return multiple flags at once", () => {
    const r = evaluateQualityFlags({
      customer_name: null,
      content_free_text: null,
      warranty_period_end: null,
      warranty_exclusions: null,
      coating_products_json: [],
      ppf_coverage_json: [],
      maintenance_json: {},
      body_repair_json: {},
      image_count: 0,
    });
    expect(r.sort()).toEqual(["no_customer_name", "no_photos", "no_service_detail", "no_warranty"].sort());
  });
});
