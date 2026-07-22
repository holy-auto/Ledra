/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/certificates/delivery-note-extract
 *
 * - free プラン (ai_draft 不可) → 403
 * - ファイル未添付 → 400
 * - JPEG添付・pro プラン → 200 + OCR 明細を返す (何も保存しない)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  extractDeliveryNote: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: mocks.resolveCaller }));
vi.mock("@/lib/ai/deliveryNoteOcr", () => ({ extractDeliveryNote: mocks.extractDeliveryNote }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/admin/certificates/delivery-note-extract/route";

function reqWithFile(file?: { name: string; bytes: Uint8Array; type: string }) {
  const form = new FormData();
  if (file) {
    form.append("delivery_note", new File([Buffer.from(file.bytes)], file.name, { type: file.type }));
  }
  return new Request("http://localhost/api/admin/certificates/delivery-note-extract", {
    method: "POST",
    body: form,
  }) as any;
}

// 最小の有効な JPEG マジックバイト (FF D8 FF ...)
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST delivery-note-extract", () => {
  it("free プランは 403", async () => {
    mocks.resolveCaller.mockResolvedValue({ tenantId: "t1", userId: "u1", planTier: "free" });
    const res = await POST(reqWithFile({ name: "a.jpg", bytes: JPEG_BYTES, type: "image/jpeg" }));
    expect(res.status).toBe(403);
    expect(mocks.extractDeliveryNote).not.toHaveBeenCalled();
  });

  it("ファイル未添付は 400", async () => {
    mocks.resolveCaller.mockResolvedValue({ tenantId: "t1", userId: "u1", planTier: "pro" });
    const res = await POST(reqWithFile());
    expect(res.status).toBe(400);
  });

  it("pro プラン + JPEG で OCR 結果を返す", async () => {
    mocks.resolveCaller.mockResolvedValue({ tenantId: "t1", userId: "u1", planTier: "pro" });
    mocks.extractDeliveryNote.mockResolvedValue({
      supplier_name: "テスト商事",
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [{ label: "ガラスコーティング剤A", code: "GC-100", quantity: 1, unit_price_jpy: null, amount_jpy: null }],
    });
    const res = await POST(reqWithFile({ name: "note.jpg", bytes: JPEG_BYTES, type: "image/jpeg" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lines).toEqual([{ label: "ガラスコーティング剤A", code: "GC-100" }]);
    expect(json.supplier_name).toBe("テスト商事");
  });
});
