import { describe, it, expect, afterEach } from "vitest";
import { generateMaintenanceSuggestion, type MaintenanceSuggestionInput } from "../maintenanceSuggestion";

const INPUT: MaintenanceSuggestionInput = {
  customerName: "山田太郎",
  shopName: "テストコーティング店",
  vehicleInfo: { maker: "トヨタ", model: "プリウス", year: 2019, currentMileage: 62000 },
  dueReminders: [
    { service_name: "ガラスコーティング再施工", reminder_type: "interval_months", overdue: true, days_until_due: -15 },
    { service_name: "オイル交換", reminder_type: "mileage", overdue: false, km_until_due: 800 },
  ],
  recentCertificates: [{ service_name: "ガラスコーティング", created_at: "2024-12-01T00:00:00Z" }],
};

describe("generateMaintenanceSuggestion (fail-open)", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("returns null when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateMaintenanceSuggestion(INPUT);
    expect(result).toBeNull();
  });

  it("does not throw on empty reminders / certificates", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateMaintenanceSuggestion({
      customerName: "テスト",
      shopName: "店",
      vehicleInfo: {},
      dueReminders: [],
      recentCertificates: [],
    });
    expect(result).toBeNull();
  });
});
