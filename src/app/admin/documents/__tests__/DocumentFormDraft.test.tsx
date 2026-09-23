// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import DocumentForm from "../DocumentForm";
import { draftKey, loadDraft, saveDraft } from "../documentDraftStorage";

const ME = { user_id: "u-1", tenant_id: "t-1" };
const KEY = draftKey({ tenantId: "t-1", userId: "u-1" });
const noop = () => {};

function mockApi(extra: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/admin/me")) return new Response(JSON.stringify(ME), { status: 200 });
      const hit = Object.keys(extra).find((k) => u.startsWith(k));
      return new Response(JSON.stringify(hit ? extra[hit] : {}), { status: 200 });
    }),
  );
}

// SWR のキャッシュをテスト間で共有しない
function renderForm(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("DocumentForm の入力途中データ自動保存", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockApi();
  });

  it("入力を端末に保存し、開き直すと復元する", async () => {
    const { unmount } = renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await settle();
    const note = screen.getAllByRole("textbox").at(-1)!;
    fireEvent.change(note, { target: { value: "誤って戻っても消えない" } });
    await waitFor(() => expect(loadDraft<{ formNote: string }>(KEY)?.data.formNote).toBe("誤って戻っても消えない"));
    unmount();

    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText(/前回の入力内容を復元しました/)).toBeTruthy());
    expect(screen.getByDisplayValue("誤って戻っても消えない")).toBeTruthy();

    fireEvent.click(screen.getByText("破棄して最初から"));
    await waitFor(() => expect(screen.queryByDisplayValue("誤って戻っても消えない")).toBeNull());
    await settle();
    expect(loadDraft(KEY)).toBeNull();
  });

  it("別テナント・別ユーザーの下書きは復元しない", async () => {
    saveDraft(draftKey({ tenantId: "t-OTHER", userId: "u-1" }), { formNote: "他テナント" });
    saveDraft(draftKey({ tenantId: "t-1", userId: "u-OTHER" }), { formNote: "他スタッフ" });
    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await settle();
    expect(screen.queryByText(/前回の入力内容を復元しました/)).toBeNull();
  });

  it("触っていない空フォームは保存しない", async () => {
    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await settle();
    expect(loadDraft(KEY)).toBeNull();
  });

  it("URL プリフィルで埋まっただけ（人が触っていない）なら保存しない", async () => {
    mockApi({
      "/api/admin/customers": {
        customers: [{ id: "c-1", name: "山田商事", honorific: "御中", address: "東京都", billing_cycle: null }],
      },
    });
    renderForm(<DocumentForm mode="create" prefillCustomerId="c-1" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByDisplayValue("東京都")).toBeTruthy());
    await settle();
    expect(loadDraft(draftKey({ tenantId: "t-1", userId: "u-1", customerId: "c-1" }))).toBeNull();
  });

  it("下書きを破棄した後も、顧客を変えると支店はリセットされる", async () => {
    mockApi({
      "/api/admin/customers": {
        customers: [
          { id: "c-1", name: "A商事", honorific: "御中" },
          { id: "c-2", name: "B商事", honorific: "御中" },
        ],
      },
      "/api/admin/customer-branches?customer_id=c-1": {
        branches: [{ id: "b-1", customer_id: "c-1", name: "A支店" }],
      },
      "/api/admin/customer-branches?customer_id=c-2": {
        branches: [{ id: "b-2", customer_id: "c-2", name: "B支店" }],
      },
    });
    saveDraft(KEY, { formNote: "顧客なしの下書き" });
    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText("破棄して最初から")).toBeTruthy());
    fireEvent.click(screen.getByText("破棄して最初から"));

    const customerSelect = (await screen.findByRole("option", { name: "A商事" })).closest("select")!;
    fireEvent.change(customerSelect, { target: { value: "c-1" } });
    const branchSelect = (await screen.findByRole("option", { name: "A支店" })).closest("select")!;
    fireEvent.change(branchSelect, { target: { value: "b-1" } });
    expect(branchSelect.value).toBe("b-1");

    fireEvent.change(customerSelect, { target: { value: "c-2" } });
    await screen.findByRole("option", { name: "B支店" });
    // 別顧客の選択肢には b-1 が無く DOM 上は常に空に見えるため、元の顧客に戻して支店が残っていないかで確かめる
    fireEvent.change(customerSelect, { target: { value: "c-1" } });
    const backBranchSelect = (await screen.findByRole("option", { name: "A支店" })).closest("select")!;
    expect(backBranchSelect.value).toBe("");
  });

  it("宛先の住所・電話・支払条件は端末に保存せず、復元時に顧客の登録内容から入れ直す", async () => {
    mockApi({
      "/api/admin/customers": {
        customers: [
          {
            id: "c-1",
            name: "山田商事",
            honorific: "御中",
            address: "東京都千代田区",
            phone: "03-0000-0000",
            billing_terms_note: "月末締め翌月末払い",
          },
        ],
      },
    });
    const { unmount } = renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    const customerSelect = (await screen.findByRole("option", { name: "山田商事" })).closest("select")!;
    fireEvent.change(customerSelect, { target: { value: "c-1" } });
    await waitFor(() => expect(screen.getByDisplayValue("東京都千代田区")).toBeTruthy());
    await waitFor(() => expect(loadDraft<Record<string, unknown>>(KEY)?.data.formCustomerId).toBe("c-1"));

    const raw = window.localStorage.getItem(KEY)!;
    expect(raw).not.toContain("東京都千代田区");
    expect(raw).not.toContain("03-0000-0000");
    expect(raw).not.toContain("月末締め翌月末払い");
    unmount();

    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText(/前回の入力内容を復元しました/)).toBeTruthy());
    await waitFor(() => expect(screen.getByDisplayValue("東京都千代田区")).toBeTruthy());
    expect(screen.getByDisplayValue("03-0000-0000")).toBeTruthy();
    expect(screen.getByDisplayValue("月末締め翌月末払い")).toBeTruthy();
  });

  it("保存キーが決まる前に入力し始めたら、古い下書きで上書きしない", async () => {
    saveDraft(KEY, { formNote: "古い下書き" });
    let releaseMe: () => void = () => {};
    const meGate = new Promise<void>((r) => (releaseMe = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/admin/me")) {
          await meGate;
          return new Response(JSON.stringify(ME), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    const note = screen.getAllByRole("textbox").at(-1)!;
    fireEvent.change(note, { target: { value: "新しく入力中" } });
    releaseMe();
    await settle();
    expect(screen.getByDisplayValue("新しく入力中")).toBeTruthy();
    expect(screen.queryByText(/前回の入力内容を復元しました/)).toBeNull();
  });

  it("開いただけでは保存時刻を更新しない（24h の期限を延ばさない）", async () => {
    const savedAt = Date.now() - 60_000;
    saveDraft(KEY, { formNote: "既存の下書き" }, savedAt);
    renderForm(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText(/前回の入力内容を復元しました/)).toBeTruthy());
    await settle();
    expect(loadDraft(KEY)?.savedAt).toBe(savedAt);
  });

  it("プリフィルだけの状態で「下書き作成」が失敗しても、入力は端末に残る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.startsWith("/api/admin/me")) return new Response(JSON.stringify(ME), { status: 200 });
        if (u.startsWith("/api/admin/customers"))
          return new Response(JSON.stringify({ customers: [{ id: "c-1", name: "山田商事", honorific: "御中" }] }));
        if (u.startsWith("/api/admin/documents") && init?.method === "POST")
          return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
        return new Response("{}", { status: 200 });
      }),
    );
    renderForm(<DocumentForm mode="create" prefillCustomerId="c-1" onSaved={noop} onCancel={noop} />);
    await waitFor(() =>
      expect((screen.getByRole("option", { name: "山田商事" }) as HTMLOptionElement).selected).toBe(true),
    );
    fireEvent.click(screen.getByText("下書き作成"));
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
    expect(
      loadDraft<{ formCustomerId: string }>(draftKey({ tenantId: "t-1", userId: "u-1", customerId: "c-1" }))?.data
        .formCustomerId,
    ).toBe("c-1");
  });

  it("edit モードでは下書きを復元しない", async () => {
    saveDraft(KEY, { formNote: "create の下書き" });
    renderForm(
      <DocumentForm
        mode="edit"
        initial={{ id: "d1", doc_type: "invoice", note: "既存", items_json: [] } as never}
        onSaved={noop}
        onCancel={noop}
      />,
    );
    await settle();
    expect(screen.queryByText(/前回の入力内容を復元しました/)).toBeNull();
    expect(screen.queryByDisplayValue("create の下書き")).toBeNull();
  });
});
