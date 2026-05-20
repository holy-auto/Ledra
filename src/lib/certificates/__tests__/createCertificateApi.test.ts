import { describe, it, expect } from "vitest";
import { certCreateJsonSchema, jsonToCertFormData, formDataToCertJson } from "@/lib/certificates/createCertificateApi";

describe("certCreateJsonSchema", () => {
  it("accepts minimal valid payload", () => {
    const r = certCreateJsonSchema.safeParse({
      customer_name: "田中太郎",
      vehicle_maker: "トヨタ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("active");
      expect(r.data.template_id).toBe("");
    }
  });

  it("rejects missing customer_name", () => {
    const r = certCreateJsonSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const r = certCreateJsonSchema.safeParse({ customer_name: "x", evil_field: "abc" });
    expect(r.success).toBe(false);
  });

  it("accepts nested *_json fields", () => {
    const r = certCreateJsonSchema.safeParse({
      customer_name: "x",
      film_thickness_json: [{ panel: "hood", value: 120 }],
      maintenance_json: { water_intrusion: true },
      template_fields: { product: "lv2", with_wax: true, panels: ["hood", "door"] },
    });
    expect(r.success).toBe(true);
  });

  it("validates status enum", () => {
    const r = certCreateJsonSchema.safeParse({ customer_name: "x", status: "weird" });
    expect(r.success).toBe(false);
  });
});

describe("jsonToCertFormData", () => {
  it("appends required fields and defaults", () => {
    const fd = jsonToCertFormData(
      certCreateJsonSchema.parse({
        customer_name: "山田太郎",
        vehicle_maker: "トヨタ",
        model: "プリウス",
        plate: "品川 300 さ 12-34",
      }),
    );
    expect(fd.get("customer_name")).toBe("山田太郎");
    expect(fd.get("vehicle_maker")).toBe("トヨタ");
    expect(fd.get("model")).toBe("プリウス");
    expect(fd.get("plate")).toBe("品川 300 さ 12-34");
    expect(fd.get("status")).toBe("active");
  });

  it("omits unset optional fields (no empty strings)", () => {
    const fd = jsonToCertFormData(
      certCreateJsonSchema.parse({
        customer_name: "x",
      }),
    );
    expect(fd.has("vin_code")).toBe(false);
    expect(fd.has("template_id")).toBe(false);
    expect(fd.has("expiry_date")).toBe(false);
  });

  it("stringifies nested JSON fields", () => {
    const fd = jsonToCertFormData(
      certCreateJsonSchema.parse({
        customer_name: "x",
        film_thickness_json: [{ panel: "hood", value: 120 }],
        maintenance_json: { water_intrusion: true },
        package_snapshot_json: { name: "Lv2", items: [{ id: "a", qty: 1 }] },
      }),
    );
    expect(JSON.parse(fd.get("film_thickness_json") as string)).toEqual([{ panel: "hood", value: 120 }]);
    expect(JSON.parse(fd.get("maintenance_json") as string)).toEqual({ water_intrusion: true });
    expect(JSON.parse(fd.get("package_snapshot_json") as string)).toEqual({
      name: "Lv2",
      items: [{ id: "a", qty: 1 }],
    });
  });

  it("expands template_fields with f__ prefix", () => {
    const fd = jsonToCertFormData(
      certCreateJsonSchema.parse({
        customer_name: "x",
        template_fields: {
          product: "lv2",
          with_wax: true,
          panels: ["hood", "door"],
          empty_panel: [] as string[],
        },
      }),
    );
    expect(fd.get("f__product")).toBe("lv2");
    // boolean true → "on" (Server Action protocol)
    expect(fd.get("f__with_wax")).toBe("on");
    // arrays expand to multiple appends
    expect(fd.getAll("f__panels")).toEqual(["hood", "door"]);
    // false booleans are omitted
    expect(fd.has("f__empty_panel")).toBe(false);
  });

  it("omits boolean false template_fields", () => {
    const fd = jsonToCertFormData(
      certCreateJsonSchema.parse({
        customer_name: "x",
        template_fields: { with_wax: false },
      }),
    );
    expect(fd.has("f__with_wax")).toBe(false);
  });
});

describe("formDataToCertJson", () => {
  it("round-trips a simple payload through json → form → json", () => {
    const original = {
      customer_name: "佐藤花子",
      vehicle_maker: "ホンダ",
      model: "フィット",
      plate: "横浜 500 さ 99-99",
      template_fields: { product: "lv1", with_wax: true, panels: ["roof", "trunk"] },
      status: "active" as const,
    };
    const fd = jsonToCertFormData(certCreateJsonSchema.parse(original));
    const back = formDataToCertJson(fd);
    expect(back.customer_name).toBe("佐藤花子");
    expect(back.vehicle_maker).toBe("ホンダ");
    expect(back.model).toBe("フィット");
    expect(back.status).toBe("active");
    expect(back.template_fields).toEqual({
      product: "lv1",
      with_wax: true,
      panels: ["roof", "trunk"],
    });
  });

  it("preserves nested *_json fields through round-trip", () => {
    const original = {
      customer_name: "x",
      film_thickness_json: [{ panel: "hood", value: 120 }],
      maintenance_json: { water_intrusion: true, notes: "ok" },
    };
    const fd = jsonToCertFormData(certCreateJsonSchema.parse(original));
    const back = formDataToCertJson(fd);
    expect(back.film_thickness_json).toEqual([{ panel: "hood", value: 120 }]);
    expect(back.maintenance_json).toEqual({ water_intrusion: true, notes: "ok" });
  });

  it("ignores empty FormData values", () => {
    const fd = new FormData();
    fd.append("customer_name", "x");
    fd.append("vin_code", "");
    fd.append("expiry_date", "");
    const out = formDataToCertJson(fd);
    expect(out.customer_name).toBe("x");
    expect("vin_code" in out).toBe(false);
    expect("expiry_date" in out).toBe(false);
  });

  it("interprets 'on' single value as boolean true in template_fields", () => {
    const fd = new FormData();
    fd.append("customer_name", "x");
    fd.append("f__with_wax", "on");
    const out = formDataToCertJson(fd);
    expect((out.template_fields as Record<string, unknown>).with_wax).toBe(true);
  });

  it("treats multiple f__ values as array", () => {
    const fd = new FormData();
    fd.append("customer_name", "x");
    fd.append("f__panels", "hood");
    fd.append("f__panels", "roof");
    const out = formDataToCertJson(fd);
    expect((out.template_fields as Record<string, unknown>).panels).toEqual(["hood", "roof"]);
  });

  it("ignores malformed JSON in *_json fields silently", () => {
    const fd = new FormData();
    fd.append("customer_name", "x");
    fd.append("film_thickness_json", "{not valid json");
    const out = formDataToCertJson(fd);
    expect("film_thickness_json" in out).toBe(false);
  });
});
