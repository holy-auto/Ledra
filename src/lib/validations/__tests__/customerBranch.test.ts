import { describe, it, expect } from "vitest";
import { branchCreateSchema, branchUpdateSchema } from "../customerBranch";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";

describe("branchCreateSchema", () => {
  it("requires a customer_id and a non-empty name", () => {
    expect(branchCreateSchema.safeParse({ customer_id: CUSTOMER_ID, name: "東京支店" }).success).toBe(true);
    expect(branchCreateSchema.safeParse({ customer_id: CUSTOMER_ID, name: "  " }).success).toBe(false);
    expect(branchCreateSchema.safeParse({ name: "東京支店" }).success).toBe(false);
  });

  it("coerces blank optional fields to null and validates email format", () => {
    const parsed = branchCreateSchema.parse({
      customer_id: CUSTOMER_ID,
      name: "大阪支店",
      phone: "",
      contact_email: "",
    });
    expect(parsed.phone).toBeNull();
    expect(parsed.contact_email).toBeNull();

    expect(
      branchCreateSchema.safeParse({ customer_id: CUSTOMER_ID, name: "x", contact_email: "not-an-email" }).success,
    ).toBe(false);
  });
});

describe("branchUpdateSchema", () => {
  it("requires a valid uuid id", () => {
    expect(branchUpdateSchema.safeParse({ id: CUSTOMER_ID, name: "支店" }).success).toBe(true);
    expect(branchUpdateSchema.safeParse({ id: "nope", name: "支店" }).success).toBe(false);
  });
});
