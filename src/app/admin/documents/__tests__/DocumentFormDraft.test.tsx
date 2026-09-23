// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DocumentForm from "../DocumentForm";
import { draftKey, loadDraft, saveDraft } from "../documentDraftStorage";

describe("DocumentForm の入力途中データ自動保存", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });

  it("入力を端末に保存し、開き直すと復元する", async () => {
    const noop = () => {};
    const { unmount } = render(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    const note = screen.getAllByRole("textbox").at(-1)!;
    fireEvent.change(note, { target: { value: "誤って戻っても消えない" } });
    await waitFor(() =>
      expect(loadDraft<{ formNote: string }>(draftKey({}))?.data.formNote).toBe("誤って戻っても消えない"),
    );
    unmount();

    render(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText(/前回の入力内容を復元しました/)).toBeTruthy());
    expect(screen.getByDisplayValue("誤って戻っても消えない")).toBeTruthy();

    fireEvent.click(screen.getByText("破棄して最初から"));
    await waitFor(() => expect(screen.queryByDisplayValue("誤って戻っても消えない")).toBeNull());
    expect(loadDraft(draftKey({}))).toBeNull();
  });

  it("触っていない空フォームは保存しない", async () => {
    const noop = () => {};
    render(<DocumentForm mode="create" onSaved={noop} onCancel={noop} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(loadDraft(draftKey({}))).toBeNull();
  });

  it("edit モードでは下書きを復元しない", async () => {
    saveDraft(draftKey({}), { formNote: "create の下書き" });
    const noop = () => {};
    render(
      <DocumentForm
        mode="edit"
        initial={{ id: "d1", doc_type: "invoice", note: "既存", items_json: [] } as never}
        onSaved={noop}
        onCancel={noop}
      />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/前回の入力内容を復元しました/)).toBeNull();
    expect(screen.queryByDisplayValue("create の下書き")).toBeNull();
  });
});
