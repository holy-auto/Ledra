import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn().mockReturnValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { notifyFtTenant, notifyFtManufacturer } from "../ftNotify";

describe("notifyFtTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifications テーブルに正しいペイロードで insert する", async () => {
    await notifyFtTenant({
      tenantId: "tenant-1",
      type: "ft_evidence_submitted",
      title: "証拠が提出されました",
      body: "案件の証拠が提出されました。",
      linkPath: "/admin/field-test",
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
    expect(mockInsert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      user_id: null,
      notification_type: "ft_evidence_submitted",
      priority: "normal",
      title: "証拠が提出されました",
      body: "案件の証拠が提出されました。",
      link_path: "/admin/field-test",
    });
  });

  it("userId 指定時は user_id がセットされる", async () => {
    await notifyFtTenant({
      tenantId: "tenant-1",
      userId: "user-42",
      type: "ft_job_assigned",
      title: "案件が割り当てられました",
      body: "テスト",
      linkPath: "/admin/field-test",
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-42" }));
  });

  it("priority 指定時はそのまま渡す", async () => {
    await notifyFtTenant({
      tenantId: "tenant-1",
      type: "ft_defect_reported",
      title: "不具合報告",
      body: "テスト",
      linkPath: "/admin/field-test",
      priority: "high",
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ priority: "high" }));
  });

  it("insert エラー時でも例外を投げない", async () => {
    mockInsert.mockReturnValueOnce({ error: { message: "db error" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyFtTenant({
        tenantId: "tenant-1",
        type: "ft_evidence_submitted",
        title: "t",
        body: "b",
        linkPath: "/",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("notifyFtManufacturer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manufacturer_notifications テーブルへ manufacturer_id で insert する", async () => {
    await notifyFtManufacturer({
      manufacturerId: "mfr-1",
      type: "ft_evidence_submitted",
      title: "証拠が提出されました",
      body: "施工店から案件の証拠が提出されました。検査してください。",
      linkPath: "/manufacturer/field-test/proj-1",
    });

    expect(mockFrom).toHaveBeenCalledWith("manufacturer_notifications");
    expect(mockInsert).toHaveBeenCalledWith({
      manufacturer_id: "mfr-1",
      user_id: null,
      notification_type: "ft_evidence_submitted",
      priority: "normal",
      title: "証拠が提出されました",
      body: "施工店から案件の証拠が提出されました。検査してください。",
      link_path: "/manufacturer/field-test/proj-1",
    });
  });

  it("insert エラー時でも例外を投げない", async () => {
    mockInsert.mockReturnValueOnce({ error: { message: "db error" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyFtManufacturer({
        manufacturerId: "mfr-1",
        type: "ft_evidence_submitted",
        title: "t",
        body: "b",
        linkPath: "/",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
