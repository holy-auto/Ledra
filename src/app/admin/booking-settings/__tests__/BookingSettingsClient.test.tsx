// @vitest-environment jsdom
/**
 * 予約設定 (BookingSettingsClient) の保存フローのコンポーネントテスト。
 *
 * 背景: 本番で「一括生成やグリッド編集で画面は更新されるのに、保存すると編集前の枠だけが
 * 再保存され初期に戻る」不具合があった。原因は保存ボタンが PageHeader→usePublishPageBar 経由で
 * ページバー(PageBar)へ publish される際、PageBar が actions を初回 publish 時のスナップショット
 * として保持し slots 変更で再 publish しないため、バー上の保存ボタンの onClick が「ロード直後の
 * handleSave（初期 slots を束縛）」に固定されていたこと（保存後の全行が同一 updated_at・新規
 * insert 0 件で確認）。修正は handleSave が最新 state を ref から読むことで、固定クロージャからでも
 * 保存ペイロードへ最新の編集を載せる。
 *
 * 本テストは実際の PageBar（Provider + AdminPageBar）を載せて保存ボタンを描画するため、この
 * 固定スナップショット挙動を再現する（＝修正前は落ち、修正後は通る回帰ガード）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookingSettingsClient from "../BookingSettingsClient";
import AdminPageBar, { PageBarProvider } from "@/components/ui/PageBar";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ページバーへ publish される保存ボタンを描画するため、実際の PageBar ごと mount する。
function renderClient() {
  return render(
    <PageBarProvider>
      <BookingSettingsClient />
      <AdminPageBar />
    </PageBarProvider>,
  );
}

describe("BookingSettingsClient 保存フロー", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let putBodies: Array<{ slots: Array<{ id?: string }> }>;

  function mockApi(opts: { initialSlots?: unknown[]; putStatus?: number; putBody?: unknown } = {}) {
    putBodies = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/admin/menu-items")) {
        return jsonResponse({ items: [] });
      }
      if (u.includes("/api/admin/booking-settings")) {
        if (init?.method === "PUT") {
          putBodies.push(JSON.parse(init.body as string));
          if (opts.putStatus && opts.putStatus >= 400) {
            return jsonResponse(opts.putBody ?? { error: "サーバエラー" }, opts.putStatus);
          }
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ slots: opts.initialSlots ?? [], closed_days: [] });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch);
  }

  afterEach(() => fetchSpy.mockRestore());

  it("一括生成した枠が保存ペイロードに含まれる（編集が初期化されない）", async () => {
    mockApi({ initialSlots: [] });
    renderClient();

    // ロード完了 = 一括生成ボタンが出るまで待つ（既定タブ=受付時間スロット）
    const bulkBtn = await screen.findByRole("button", { name: /一括生成/ });
    // 既定値: 平日(月〜金) × 09:00–18:00 を 60分毎に生成 → 空だった slots に新規枠が積まれる
    fireEvent.click(bulkBtn);

    fireEvent.click(await screen.findByRole("button", { name: /保存する/ }));

    await waitFor(() => expect(putBodies.length).toBe(1));
    const payloadSlots = putBodies[0].slots;
    // 生成した枠が保存ペイロードに載っていること（固定クロージャなら初期の 0 件のまま送られる）。
    expect(payloadSlots.length).toBeGreaterThan(0);
    // 生成枠はすべて未保存＝ id 無し（サーバ側で insert される）
    expect(payloadSlots.every((s) => s.id === undefined)).toBe(true);
  });

  it("保存失敗時はサーバのエラーメッセージを表示する", async () => {
    mockApi({ initialSlots: [], putStatus: 400, putBody: { error: "枠が多すぎます(テスト)" } });
    renderClient();

    fireEvent.click(await screen.findByRole("button", { name: /保存する/ }));

    // 固定文言 "保存に失敗しました" ではなく、サーバの error をトーストに出す
    await waitFor(() => expect(screen.getByText("枠が多すぎます(テスト)")).toBeDefined());
  });
});
