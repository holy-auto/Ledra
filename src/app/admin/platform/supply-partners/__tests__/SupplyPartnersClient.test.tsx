// @vitest-environment jsdom
/**
 * 運営の供給パートナー信頼トグル UI (SupplyPartnersClient) のコンポーネントテスト。
 * 一覧描画 / 信頼バッジ / API未連携は付与ボタン無効 / トグルで POST + 楽観更新 / 空状態。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import SupplyPartnersClient from "../SupplyPartnersClient";

const P_READY = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "卸元A(連携済み)",
  contact_email: "a@example.jp",
  contact_phone: null,
  status: "active",
  integration_status: "connected",
  is_trusted: false,
  agent_id: "ag1",
  api_endpoint: "https://a.example.com",
  api_auth_type: "api_key",
  last_order_at: null,
  created_at: "2026-06-01",
  credentials_configured: true,
};
const P_NOT_READY = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "卸元B(未連携)",
  contact_email: null,
  contact_phone: null,
  status: "pending",
  integration_status: "unconfigured",
  is_trusted: false,
  agent_id: "ag2",
  api_endpoint: null,
  api_auth_type: "none",
  last_order_at: null,
  created_at: "2026-05-01",
  credentials_configured: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SupplyPartnersClient (運営トグルUI)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function mockList(partners: unknown[]) {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        return jsonResponse({
          ok: true,
          supply_partner_id: body.supply_partner_id,
          is_trusted: body.is_trusted,
          message: "更新しました。",
        });
      }
      return jsonResponse({ ok: true, partners });
    }) as unknown as typeof fetch);
  }

  beforeEach(() => {
    mockList([structuredClone(P_READY), structuredClone(P_NOT_READY)]);
  });
  afterEach(() => fetchSpy.mockRestore());

  it("一覧を読み込み、各行と『未信頼』バッジを表示する", async () => {
    render(<SupplyPartnersClient />);
    await waitFor(() => expect(screen.getByText("卸元A(連携済み)")).toBeDefined());
    expect(screen.getByText("卸元B(未連携)")).toBeDefined();
    expect(screen.getAllByText("未信頼")).toHaveLength(2);
  });

  it("API連携が揃わないパートナーは付与ボタンが無効、連携済みは有効", async () => {
    render(<SupplyPartnersClient />);
    await waitFor(() => expect(screen.getByText("卸元B(未連携)")).toBeDefined());

    const rowB = screen.getByText("卸元B(未連携)").closest("tr") as HTMLElement;
    const btnB = within(rowB).getByRole("button", { name: /信頼を付与/ }) as HTMLButtonElement;
    expect(btnB.disabled).toBe(true);

    const rowA = screen.getByText("卸元A(連携済み)").closest("tr") as HTMLElement;
    const btnA = within(rowA).getByRole("button", { name: /信頼を付与/ }) as HTMLButtonElement;
    expect(btnA.disabled).toBe(false);
  });

  it("連携済みパートナーの信頼を付与すると POST し、バッジが信頼済みに変わる", async () => {
    render(<SupplyPartnersClient />);
    await waitFor(() => expect(screen.getByText("卸元A(連携済み)")).toBeDefined());

    const rowA = screen.getByText("卸元A(連携済み)").closest("tr") as HTMLElement;
    fireEvent.click(within(rowA).getByRole("button", { name: /信頼を付与/ }));

    await waitFor(() => {
      const post = fetchSpy.mock.calls.find((c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "POST");
      expect(post).toBeDefined();
    });
    const post = fetchSpy.mock.calls.find((c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(post[0]).toBe("/api/admin/platform/supply-partners");
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.supply_partner_id).toBe(P_READY.id);
    expect(body.is_trusted).toBe(true);

    // 楽観的更新でバッジとボタンが切り替わる
    await waitFor(() => expect(within(rowA).getByText("信頼済み")).toBeDefined());
    expect(within(rowA).getByRole("button", { name: /信頼を解除/ })).toBeDefined();
  });

  it("パートナーが0件なら空状態の案内を表示する", async () => {
    fetchSpy.mockRestore();
    mockList([]);
    render(<SupplyPartnersClient />);
    await waitFor(() => expect(screen.getByText(/まだ登録されていません/)).toBeDefined());
  });
});
