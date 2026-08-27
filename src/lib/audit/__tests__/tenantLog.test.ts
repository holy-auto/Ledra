import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { logTenantAuditEvent } from "../tenantLog";

/** insert に渡された行を捕まえるだけの最小のダブル */
function fakeDb(error: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  return { db: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

describe("logTenantAuditEvent", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("audit_logs の実列だけに書く（存在しない列を1つでも入れると insert ごと失敗する）", async () => {
    const { db, insert } = fakeDb();
    await logTenantAuditEvent(db, {
      tenantId: "t1",
      userId: "u1",
      action: "certificate_activated",
      table: "certificates",
      recordId: "c1",
      targetPublicId: "PUB1",
    });

    expect(db.from).toHaveBeenCalledWith("audit_logs");
    const row = insert.mock.calls[0][0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "action",
        "actor_type",
        "actor_user_id",
        "ip",
        "query_json",
        "target_public_id",
        "tenant_id",
        "user_agent",
      ].sort(),
    );
    // 以前ここに書いていた列は1つも残っていないこと
    for (const gone of ["table_name", "record_id", "performed_by", "ip_address", "old_values", "new_values"]) {
      expect(row).not.toHaveProperty(gone);
    }
  });

  it("actor_type は必須（NOT NULL）なので必ず入れる。既定は tenant", async () => {
    const { db, insert } = fakeDb();
    await logTenantAuditEvent(db, { tenantId: "t1", action: "a", table: "t", recordId: "r" });
    expect(insert.mock.calls[0][0].actor_type).toBe("tenant");
  });

  it("cron など人がいない経路は system を指定できる", async () => {
    const { db, insert } = fakeDb();
    await logTenantAuditEvent(db, {
      tenantId: "t1",
      action: "a",
      table: "t",
      recordId: "r",
      actorType: "system",
    });
    const row = insert.mock.calls[0][0];
    expect(row.actor_type).toBe("system");
    expect(row.actor_user_id).toBeNull();
  });

  it("専用列の無い table / record_id / 付随情報は query_json にまとめる", async () => {
    const { db, insert } = fakeDb();
    await logTenantAuditEvent(db, {
      tenantId: "t1",
      action: "certificate_voided",
      table: "certificates",
      recordId: "c1",
      extra: { void_reason: "誤発行" },
    });
    expect(insert.mock.calls[0][0].query_json).toEqual({
      table: "certificates",
      record_id: "c1",
      void_reason: "誤発行",
    });
  });

  it("リクエストがあれば IP と User-Agent を取る", async () => {
    const { db, insert } = fakeDb();
    const req = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.1", "user-agent": "UA/1" },
    });
    await logTenantAuditEvent(db, { tenantId: "t1", action: "a", table: "t", recordId: "r", req });
    const row = insert.mock.calls[0][0];
    expect(row.ip).toBe("203.0.113.1");
    expect(row.user_agent).toBe("UA/1");
  });

  it("失敗しても投げない（本体の操作はすでに終わっている）が、黙って捨てもしない", async () => {
    const { db } = fakeDb({ message: "column does not exist" });
    await expect(
      logTenantAuditEvent(db, { tenantId: "t1", action: "a", table: "t", recordId: "r" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
