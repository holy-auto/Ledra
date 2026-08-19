// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import BottomSheet from "../BottomSheet";

describe("BottomSheet", () => {
  it("open=false では何も描画しない", () => {
    const { container } = render(
      <BottomSheet open={false} onClose={() => {}} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("open=true で dialog ロール・タイトル・内容を描画する", () => {
    const { container, getByText } = render(
      <BottomSheet open onClose={() => {}} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("詳細");
    expect(dialog?.className).toContain("bottom-0");
    expect(getByText("内容")).toBeDefined();
  });

  it("Escape で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタン(44px タッチターゲット)で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open onClose={onClose} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    const btn = container.querySelector('button[aria-label="閉じる"]');
    expect(btn?.className).toContain("h-11");
    fireEvent.click(btn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じるとフォーカスが開く前の要素に復元される", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "開く";
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(
      <BottomSheet open onClose={() => {}} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} onClose={() => {}} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("open 中は body スクロールがロックされる", () => {
    const { unmount } = render(
      <BottomSheet open onClose={() => {}} title="詳細">
        <p>内容</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
