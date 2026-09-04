/**
 * admin/reservations/[id]/handoff POST + DELETE integration tests.
 *
 * Verifies the申し送りメモ contract:
 *   - 401 when no caller
 *   - 400 on invalid body (empty content)
 *   - 404 when the reservation is not in the caller's tenant
 *   - POST appends a structured note (author_id from caller, server-set id/created_at)
 *   - POST caps the array at 50 entries, dropping the oldest
 *   - DELETE removes only the caller's own note; others are rejected (400)
 *   - DELETE requires note_id
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCallerMock, checkRateLimitMock, getUserMock, fromMock } = vi.hoisted(() => ({
  resolveCallerMock: vi.fn(),
  // checkRateLimit returns null when allowed
  checkRateLimitMock: vi.fn().mockResolvedValue(null),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => fromMock(...args),
      auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    }),
}));

// モジュールごと差し替えると requirePermission が undefined になり、
// ルートのガードが TypeError → 500 になる。実物は残して解決だけ差し替える。
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: (...args: unknown[]) => resolveCallerMock(...args),
}));

vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { POST, DELETE } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const OTHER_USER = "33333333-3333-3333-3333-333333333333";
const RES_ID = "44444444-4444-4444-4444-444444444444";

/**
 * Builds a chainable supabase mock for a single `from("reservations")` call.
 * `selectResult` is what the first `.select(...).eq().eq().maybeSingle()` resolves to.
 * `updateResult` is what `.update(...).eq().eq().select().single()` resolves to;
 * the update payload is captured into `captured.updatePayload`.
 */
function makeReservationsMock(opts: {
  selectResult: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  captured: { updatePayload?: Record<string, unknown> };
}) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(opts.selectResult),
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      opts.captured.updatePayload = payload;
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve(opts.updateResult ?? { data: payload, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

function postReq(body: unknown) {
  return new Request(`http://localhost/api/admin/reservations/${RES_ID}/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(noteId?: string) {
  const url = new URL(`http://localhost/api/admin/reservations/${RES_ID}/handoff`);
  if (noteId !== undefined) url.searchParams.set("note_id", noteId);
  return new Request(url, { method: "DELETE" });
}

const params = Promise.resolve({ id: RES_ID });

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  resolveCallerMock.mockResolvedValue({ userId: USER, tenantId: TENANT, role: "staff", planTier: "pro" });
  getUserMock.mockResolvedValue({
    data: { user: { id: USER, email: "tanaka@example.com", user_metadata: { display_name: "田中" } } },
  });
});

describe("POST /api/admin/reservations/[id]/handoff", () => {
  it("returns 401 when no caller", async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ content: "x" }) as never, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty content", async () => {
    const res = await POST(postReq({ content: "   ", priority: "normal" }) as never, { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when reservation is not in tenant", async () => {
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(makeReservationsMock({ selectResult: { data: null, error: null }, captured }));
    const res = await POST(postReq({ content: "hi" }) as never, { params });
    expect(res.status).toBe(404);
  });

  it("appends a structured note with author_id from caller and server-set fields", async () => {
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: [] }, error: null },
        captured,
      }),
    );

    const res = await POST(postReq({ content: "左ドア乾燥待ち", priority: "important" }) as never, { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      note: { id: string; author_id: string; author_name: string; content: string; priority: string };
    };
    expect(json.ok).toBe(true);
    expect(json.note.author_id).toBe(USER);
    expect(json.note.author_name).toBe("田中");
    expect(json.note.content).toBe("左ドア乾燥待ち");
    expect(json.note.priority).toBe("important");
    expect(json.note.id).toMatch(/[0-9a-f-]{36}/);

    // the persisted payload should contain exactly the one appended note
    const persisted = captured.updatePayload?.handoff_notes as unknown[];
    expect(Array.isArray(persisted)).toBe(true);
    expect(persisted).toHaveLength(1);
  });

  it("caps the array at 50 entries, dropping the oldest", async () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      id: `note-${i}`,
      author_id: OTHER_USER,
      author_name: "X",
      content: `c${i}`,
      created_at: new Date(2020, 0, 1, 0, i).toISOString(),
      priority: "normal" as const,
    }));
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: existing }, error: null },
        captured,
      }),
    );

    const res = await POST(postReq({ content: "newest" }) as never, { params });
    expect(res.status).toBe(200);

    const persisted = captured.updatePayload?.handoff_notes as Array<{ id: string; content: string }>;
    expect(persisted).toHaveLength(50);
    // oldest (note-0) dropped; newest appended at the end
    expect(persisted.find((n) => n.id === "note-0")).toBeUndefined();
    expect(persisted[persisted.length - 1].content).toBe("newest");
  });

  it("falls back to email local-part when display_name is missing", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: USER, email: "owner@shop.jp", user_metadata: {} } },
    });
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: [] }, error: null },
        captured,
      }),
    );
    const res = await POST(postReq({ content: "hello" }) as never, { params });
    const json = (await res.json()) as { note: { author_name: string } };
    expect(json.note.author_name).toBe("owner");
  });
});

describe("DELETE /api/admin/reservations/[id]/handoff", () => {
  it("returns 400 when note_id missing", async () => {
    const res = await DELETE(deleteReq() as never, { params });
    expect(res.status).toBe(400);
  });

  it("deletes the caller's own note", async () => {
    const notes = [
      {
        id: "mine",
        author_id: USER,
        author_name: "田中",
        content: "a",
        created_at: new Date().toISOString(),
        priority: "normal" as const,
      },
      {
        id: "keep",
        author_id: USER,
        author_name: "田中",
        content: "b",
        created_at: new Date().toISOString(),
        priority: "normal" as const,
      },
    ];
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: notes }, error: null },
        captured,
      }),
    );

    const res = await DELETE(deleteReq("mine") as never, { params });
    expect(res.status).toBe(200);
    const persisted = captured.updatePayload?.handoff_notes as Array<{ id: string }>;
    expect(persisted.map((n) => n.id)).toEqual(["keep"]);
  });

  it("rejects deleting another user's note with 400", async () => {
    const notes = [
      {
        id: "theirs",
        author_id: OTHER_USER,
        author_name: "佐藤",
        content: "a",
        created_at: new Date().toISOString(),
        priority: "urgent" as const,
      },
    ];
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: notes }, error: null },
        captured,
      }),
    );

    const res = await DELETE(deleteReq("theirs") as never, { params });
    expect(res.status).toBe(400);
    // nothing persisted
    expect(captured.updatePayload).toBeUndefined();
  });

  it("returns 404 when the note id does not exist", async () => {
    const captured: { updatePayload?: Record<string, unknown> } = {};
    fromMock.mockReturnValue(
      makeReservationsMock({
        selectResult: { data: { id: RES_ID, handoff_notes: [] }, error: null },
        captured,
      }),
    );
    const res = await DELETE(deleteReq("ghost") as never, { params });
    expect(res.status).toBe(404);
  });
});
