import { describe, it, expect, vi } from "vitest";

// 設備・資格は1施工店1行で他社とも共有。メーカーは閲覧のみで、書き込みの口を置かない
// （書き込みは施工店本人の /api/admin・/api/mobile の field-test/workshop-profile だけ）。

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/manufacturerCaller", () => ({ resolveManufacturerCaller: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: vi.fn() }));

import * as route from "@/app/api/manufacturer/field-test/workshop-profiles/route";

describe("メーカー向け 施工店の設備・資格", () => {
  it("GET だけを出し、書き込みのメソッドを出さない", () => {
    expect(typeof route.GET).toBe("function");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(route).not.toHaveProperty(m);
  });
});
