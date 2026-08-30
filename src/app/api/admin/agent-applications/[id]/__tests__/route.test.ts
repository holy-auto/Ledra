/**
 * agent-applications [id] PUT integration test.
 *
 * Covers the multi-step approve path that the audit (MEDIUM-4) flagged
 * for compensation handling: it spans auth.users creation → RPC
 * (`approve_agent_application`) → email. The contract tested here:
 *
 *   - 403 for non-platform-admin callers
 *   - "under_review" succeeds and returns the row
 *   - "rejected" requires a reason
 *   - "approved" returns 200 + agent_id when RPC succeeds and uses an
 *     existing auth user (no temp password)
 *   - "approved" rolls back a newly-created auth user when RPC fails
 *   - unknown status returns 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  resolveCallerMock,
  isPlatformAdminMock,
  notifyApprovedMock,
  notifyRejectedMock,
  adminApiListMock,
  adminApiCreateMock,
  adminApiDeleteMock,
  rpcMock,
  fromMock,
  storageFromMock,
} = vi.hoisted(() => ({
  resolveCallerMock: vi.fn(),
  isPlatformAdminMock: vi.fn(),
  notifyApprovedMock: vi.fn().mockResolvedValue(undefined),
  notifyRejectedMock: vi.fn().mockResolvedValue(undefined),
  adminApiListMock: vi.fn(),
  adminApiCreateMock: vi.fn(),
  adminApiDeleteMock: vi.fn().mockResolvedValue({ error: null }),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  storageFromMock: vi.fn(() => ({
    createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.com/sig" } }),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({/* user-scoped — only used by resolveCallerWithRole */}),
}));

vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: (...args: unknown[]) => resolveCallerMock(...args),
}));

vi.mock("@/lib/auth/platformAdmin", () => ({
  isPlatformAdmin: (...args: unknown[]) => isPlatformAdminMock(...args),
}));

vi.mock("@/lib/agent/email", () => ({
  notifyApplicationApproved: (...args: unknown[]) => notifyApprovedMock(...args),
  notifyApplicationRejected: (...args: unknown[]) => notifyRejectedMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: fromMock,
      rpc: rpcMock,
      storage: { from: storageFromMock },
      auth: {
        admin: {
          listUsers: () => adminApiListMock(),
          createUser: (...a: unknown[]) => adminApiCreateMock(...a),
          deleteUser: (...a: unknown[]) => adminApiDeleteMock(...a),
        },
      },
    },
    tenantId: "platform-tenant",
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { PUT } from "@/app/api/admin/agent-applications/[id]/route";
import { NextRequest } from "next/server";

function putReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/agent-applications/app-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "app-1" }) };

const baseApp = {
  id: "app-1",
  application_number: "APP-001",
  company_name: "Acme",
  contact_name: "Tanaka",
  email: "owner@example.com",
  phone: "0312345678",
  industry: "auto-repair",
  status: "submitted",
  documents: [],
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  user_id: null,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
};

/**
 * Build a chainable supabase-from() result. `result` is what `.single()`
 * eventually resolves with. Any combination of select/eq/in/update/insert
 * is allowed and returns the same chain.
 */
function chainSingle(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const key of ["select", "eq", "in", "update", "insert"]) {
    chain[key] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}

describe("PUT /api/admin/agent-applications/[id]", () => {
  beforeEach(() => {
    resolveCallerMock.mockReset();
    isPlatformAdminMock.mockReset();
    notifyApprovedMock.mockClear();
    notifyRejectedMock.mockClear();
    adminApiListMock.mockReset();
    adminApiCreateMock.mockReset();
    adminApiDeleteMock.mockClear();
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns 401 when caller is unauthenticated", async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const res = await PUT(putReq({ status: "under_review" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is authenticated but not a platform admin", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
    isPlatformAdminMock.mockReturnValueOnce(false);
    const res = await PUT(putReq({ status: "under_review" }), ctx);
    expect(res.status).toBe(403);
  });

  it("under_review: updates the row and returns 200", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);
    fromMock.mockReturnValueOnce(chainSingle({ data: { ...baseApp, status: "under_review" }, error: null }));

    const res = await PUT(putReq({ status: "under_review" }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: { status: string } };
    expect(body.application.status).toBe("under_review");
  });

  it("rejected: requires a rejection_reason", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);

    const res = await PUT(putReq({ status: "rejected" }), ctx);
    expect(res.status).toBe(400);
    expect(notifyRejectedMock).not.toHaveBeenCalled();
  });

  it("rejected: updates the row and triggers rejection email", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);
    fromMock.mockReturnValueOnce(
      chainSingle({ data: { ...baseApp, status: "rejected", rejection_reason: "incomplete docs" }, error: null }),
    );

    const res = await PUT(putReq({ status: "rejected", rejection_reason: "incomplete docs" }), ctx);
    expect(res.status).toBe(200);
    expect(notifyRejectedMock).toHaveBeenCalledOnce();
    expect(notifyRejectedMock).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ rejectionReason: "incomplete docs" }),
    );
  });

  it("approved + existing auth user: skips createUser, calls RPC, returns agent_id, sends email", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);

    // First .from() — fetch the application row (status: submitted)
    fromMock.mockReturnValueOnce(chainSingle({ data: baseApp, error: null }));
    // listUsers returns a matching email — so no createUser is issued.
    adminApiListMock.mockResolvedValueOnce({
      data: { users: [{ id: "existing-user-1", email: "owner@example.com" }] },
    });
    rpcMock.mockResolvedValueOnce({ data: "agent-99", error: null });

    const res = await PUT(putReq({ status: "approved" }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agent_id: string };
    expect(body.agent_id).toBe("agent-99");
    expect(adminApiCreateMock).not.toHaveBeenCalled();
    expect(adminApiDeleteMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith(
      "approve_agent_application",
      expect.objectContaining({ p_application_id: "app-1", p_user_id: "existing-user-1", p_reviewer_id: "admin-1" }),
    );
    expect(notifyApprovedMock).toHaveBeenCalledOnce();
    // Existing user must NOT be sent a temp password.
    expect(notifyApprovedMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ temporaryPassword: expect.stringContaining("既存のパスワード") }),
    );
  });

  it("approved + new user but RPC fails: rolls back the newly-created auth user", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);

    fromMock.mockReturnValueOnce(chainSingle({ data: baseApp, error: null }));
    adminApiListMock.mockResolvedValueOnce({ data: { users: [] } }); // no match → createUser
    adminApiCreateMock.mockResolvedValueOnce({ data: { user: { id: "new-user-7" } }, error: null });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "agent insert failed" } });

    const res = await PUT(putReq({ status: "approved" }), ctx);
    expect(res.status).toBe(500);
    expect(adminApiDeleteMock).toHaveBeenCalledWith("new-user-7");
    expect(notifyApprovedMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unrecognized status", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "admin-1", tenantId: "platform-tenant" });
    isPlatformAdminMock.mockReturnValueOnce(true);

    const res = await PUT(putReq({ status: "frobnicate" }), ctx);
    expect(res.status).toBe(400);
  });
});
