// @vitest-environment jsdom
/**
 * code-review 指摘の回帰確認 (2026-09-09):
 * サーバー側（E3-1是正）は日時が重複する予約作成/更新に対し 409 + code:"conflict" を
 * 返し、force:true での再送を案内している。しかしこの管理画面 UI にはそれが配線されて
 * おらず、正当な重複予約（担当者・ブース違い等）を確認の上で登録する手段がなく常に
 * 拒否されていた。409+conflict のときだけ確認ダイアログを出し、同意されたら
 * force:true を付けて同一エンドポイントに再送することを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReservationsClient from "../ReservationsClient";
import { UiPreferencesProvider } from "@/lib/ui-preferences/UiPreferencesContext";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("create=1"),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderClient() {
  return render(
    <UiPreferencesProvider>
      <ReservationsClient />
    </UiPreferencesProvider>,
  );
}

describe("ReservationsClient 予約作成の409衝突リトライ", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let reservationCalls: Array<{ method: string; body: any }>;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  function mockApi(opts: { confirmResult: boolean }) {
    reservationCalls = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("/api/admin/reservations?")) {
        return jsonResponse({ reservations: [], stats: { total: 0, today_count: 0, active_count: 0 }, total: 0 });
      }
      if (u === "/api/admin/reservations" && init?.method) {
        const body = init.body ? JSON.parse(init.body as string) : {};
        reservationCalls.push({ method: init.method, body });
        if (!body.force) {
          return jsonResponse(
            {
              code: "conflict",
              message: "ご指定の時間帯は既に予約が入っています。よろしければ force で再送してください。",
            },
            409,
          );
        }
        return jsonResponse({ reservation: { id: "r1" } }, 200);
      }
      if (u.includes("/api/admin/customers?action=vehicles")) return jsonResponse({ vehicles: [] });
      if (u.includes("/api/admin/customers")) return jsonResponse({ customers: [] });
      if (u.includes("/api/admin/menu-items")) return jsonResponse({ items: [] });
      if (u.includes("/api/admin/tenants")) return jsonResponse({ tenants: [] });
      if (u.includes("/api/admin/workflow-templates")) return jsonResponse({ templates: [] });
      if (u.includes("/api/admin/loaner-cars")) return jsonResponse({ cars: [] });
      if (u.includes("/api/admin/gcal")) return jsonResponse({ connected: false }, 404);
      if (u.includes("/api/admin/ui-preferences"))
        return jsonResponse({ ok: true, displayMode: "standard", onboardingCompleted: true });
      return jsonResponse({}, 404);
    }) as typeof fetch);
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(opts.confirmResult);
  }

  afterEach(() => {
    fetchSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("409+conflictのときは確認ダイアログを出し、同意すればforce:trueで再送して成功する", async () => {
    mockApi({ confirmResult: true });
    renderClient();

    const titleInput = await screen.findByPlaceholderText("例: ガラスコーティング");
    fireEvent.change(titleInput, { target: { value: "テスト予約" } });

    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => expect(reservationCalls.length).toBe(2));
    expect(reservationCalls[0].body.force).toBeFalsy();
    expect(reservationCalls[1].body.force).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // 再送成功後はモーダルが閉じる（handleSubmit の setShowForm(false)）
    await waitFor(() => expect(screen.queryByPlaceholderText("例: ガラスコーティング")).toBeNull());
  });

  it("409+conflictで確認をキャンセルしたら再送せず、エラー表示にも落とさない", async () => {
    mockApi({ confirmResult: false });
    renderClient();

    const titleInput = await screen.findByPlaceholderText("例: ガラスコーティング");
    fireEvent.change(titleInput, { target: { value: "テスト予約" } });

    const form = titleInput.closest("form");
    fireEvent.submit(form!);

    await waitFor(() => expect(reservationCalls.length).toBe(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // キャンセル後も追加の再送が起きないことを確認する
    await new Promise((r) => setTimeout(r, 50));
    expect(reservationCalls.length).toBe(1);
  });
});
