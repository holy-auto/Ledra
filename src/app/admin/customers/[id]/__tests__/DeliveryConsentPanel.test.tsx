// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import DeliveryConsentPanel from "../DeliveryConsentPanel";

/** 押し間違いで「店舗の記録」にならないこと（2026-10-09 に代表が実際に押し間違えた）。 */
function mockFetch(consent: Record<string, unknown> | null) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const status = consent ? consent.status : "none";
      return new Response(JSON.stringify({ status, consent }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeliveryConsentPanel", () => {
  it("未承諾では「承諾のお願い」を先に出し、店舗の記録は確認でやめれば何も送らない", async () => {
    const calls = mockFetch(null);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DeliveryConsentPanel customerId="c1" />);
    await screen.findByText("リンクと QR を作る");
    fireEvent.click(screen.getByText("書面・口頭で承諾を得た（店舗として記録）"));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("店舗が記録した承諾には「取り消す」を出し、確認すると cancel_record で消す", async () => {
    const calls = mockFetch({ status: "granted", granted_by: "u1", granted_at: "2026-10-09T15:40:00Z" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeliveryConsentPanel customerId="c1" />);
    fireEvent.click(await screen.findByText("店舗の記録を取り消す（未承諾に戻す）"));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: "/api/admin/customers/c1/delivery-consent?mode=cancel_record",
        method: "DELETE",
      }),
    );
  });

  it("お客様本人の承諾には「取り消す」を出さない", async () => {
    mockFetch({ status: "granted", granted_by: null, granted_at: "2026-10-09T15:40:00Z" });
    render(<DeliveryConsentPanel customerId="c1" />);
    await screen.findByText(/お客様本人/);
    expect(screen.queryByText("店舗の記録を取り消す（未承諾に戻す）")).toBeNull();
  });
});
