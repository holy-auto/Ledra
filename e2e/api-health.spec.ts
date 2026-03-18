import { test, expect } from "@playwright/test";

test.describe("API health checks", () => {
  test("contact API rejects invalid body", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: { name: "" }, // missing required fields
    });
    expect(res.status()).toBe(400);
  });

  test("contact API rejects empty JSON", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("join API rejects weak password", async ({ request }) => {
    const res = await request.post("/api/join", {
      data: {
        company_name: "Test Co",
        contact_person: "Test Person",
        email: "test@example.com",
        password: "weak", // too short
      },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
  });

  test("join API rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/join", {
      data: {
        password: "StrongPass1",
        // missing company_name, contact_person, email
      },
    });
    expect(res.status()).toBe(400);
  });

  test("admin API returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/customers");
    expect(res.status()).toBe(401);
  });

  test("CSRF protection blocks cross-origin POST", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: { name: "test" },
      headers: {
        origin: "https://evil.com",
        host: "localhost:3000",
      },
    });
    // Should be blocked by CSRF middleware
    expect([400, 403]).toContain(res.status());
  });
});
