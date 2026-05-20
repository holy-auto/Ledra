import { describe, it, expect } from "vitest";
import { certCreateJsonSchema, jsonToCertFormData } from "@/lib/certificates/createCertificateApi";

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
