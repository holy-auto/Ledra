/**
 * daily-digest cron の gating ロジックの単体テスト。
 *
 * 検証する契約 (コスト安全の要):
 *   - AI 無効 (settings.enabled=false) のテナントは AI 生成も保存もしない
 *   - 急ぎタスクが無い (tiles.length=0) テナントは保存しない
 *   - AI 有効 + タスクあり のテナントだけ generateDailyDigest → upsert する
 *   - 集計結果に skipped_no_ai / skipped_no_tasks / ai_generated が正しく出る
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { loadSettingsMock, fetchSignalsMock, genMock, recordMock, upsertMock, tenantsData } = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  fetchSignalsMock: vi.fn(),
  genMock: vi.fn(),
  recordMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({ error: null }),
  tenantsData: { rows: [] as Array<{ id: string; name: string | null }> },
}));

vi.mock("@/lib/cronAuth", () => ({ verifyCronRequest: () => ({ authorized: true }) }));
vi.mock("@/lib/cron/lock", () => ({
  withCronLock: async (_a: unknown, _n: string, _t: number, fn: () => Promise<unknown>) => ({
    acquired: true,
    value: await fn(),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (table: string) => {
      if (table === "tenants") {
        return {
          select: () => ({ eq: () => ({ returns: () => Promise.resolve({ data: tenantsData.rows, error: null }) }) }),
        };
      }
      if (table === "tenant_daily_digests") {
        return {
          upsert: (row: unknown, opts: unknown) => {
            upsertMock(row, opts);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: (id: string) => loadSettingsMock(id) }));
vi.mock("@/lib/admin/fetchTodaySignals", () => ({
  fetchTodaySignals: (id: string) => fetchSignalsMock(id),
  tilesFromSignals: (s: { tiles: unknown[] }) => s.tiles,
}));
vi.mock("@/lib/admin/dailyDigest", () => ({ generateDailyDigest: (...a: unknown[]) => genMock(...a) }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: recordMock }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { GET } from "../route";

const TENANT_A = "aaaaaaaa-0000-0000-0000-000000000000"; // AI有効 + タスクあり
const TENANT_B = "bbbbbbbb-0000-0000-0000-000000000000"; // AI無効
const TENANT_C = "cccccccc-0000-0000-0000-000000000000"; // AI有効 + タスクなし

describe("GET /api/cron/daily-digest", () => {
  beforeEach(() => {
    loadSettingsMock.mockReset();
    fetchSignalsMock.mockReset();
    genMock.mockReset();
    recordMock.mockReset();
    upsertMock.mockClear();

    tenantsData.rows = [
      { id: TENANT_A, name: "店A" },
      { id: TENANT_B, name: "店B" },
      { id: TENANT_C, name: "店C" },
    ];
    loadSettingsMock.mockImplementation((id: string) => ({ enabled: id !== TENANT_B }));
    fetchSignalsMock.mockImplementation((id: string) => ({
      tiles: id === TENANT_C ? [] : [{ id: "in_progress_jobs", label: "作業中の案件", count: 2 }],
    }));
    genMock.mockResolvedValue({ text: "作業中の案件2件を確認してください。", ai: true });
  });

  it("AI有効+タスクありのテナントだけ生成・保存する", async () => {
    const res = await GET(new NextRequest("https://app.example.com/api/cron/daily-digest"));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.ai_generated).toBe(1);
    expect(body.skipped_no_ai).toBe(1); // 店B
    expect(body.skipped_no_tasks).toBe(1); // 店C

    // upsert は店Aの1回だけ
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({ tenant_id: TENANT_A, text: "作業中の案件2件を確認してください。", ai: true });
    expect(opts).toEqual({ onConflict: "tenant_id,digest_date" });

    // AI無効テナントでは generateDailyDigest を呼ばない (コスト安全)
    expect(genMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });
});
