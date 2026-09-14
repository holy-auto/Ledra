// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type React from "react";
import BottomSheet from "../BottomSheet";
import Modal from "../Modal";
import Drawer from "../Drawer";

// Codex レビューで指摘された2件の再現条件をそのまま固定する。
// どちらも「複数のダイアログが同時に存在する」ときにだけ壊れるので、
// 単体テスト(1つだけ開く)では緑のまま通ってしまっていた。
describe("useDialogA11y — 複数ダイアログの共存", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("開いている Modal の隣に閉じた BottomSheet がマウントされてもロックは外れない", () => {
    render(
      <Modal open onClose={() => {}} title="親">
        <p>内容</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    // 閉じたまま**マウントされるだけ**。以前はこれで親のロックが外れていた。
    render(
      <BottomSheet open={false} onClose={() => {}} title="子">
        <p>内容</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("2つ開いて片方だけ閉じてもロックは残り、最後の1つで元に戻る", () => {
    const modal = render(
      <Modal open onClose={() => {}} title="親">
        <p>内容</p>
      </Modal>,
    );
    const drawer = render(
      <Drawer open onClose={() => {}} title="子">
        <p>内容</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    modal.unmount();
    expect(document.body.style.overflow).toBe("hidden"); // Drawer がまだ開いている

    drawer.unmount();
    expect(document.body.style.overflow).toBe(""); // 最後の1つ
  });

  it("元の overflow 値を覚えて戻す(空文字で上書きしない)", () => {
    document.body.style.overflow = "clip";
    const { unmount } = render(
      <Modal open onClose={() => {}} title="親">
        <p>内容</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });
});

describe("useDialogA11y — フォーカストラップの候補", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  // 判定は「末尾の可視要素で Tab を押したときに折り返しが**発火するか**」。
  // 折り返し先(Modal 自身の閉じるボタン)はマークアップ依存なので見ない。
  // 候補の取り違えが起きると折り返しが発火せず、フォーカスは末尾に留まったまま
  // ブラウザ側で次のタブ順 —— ダイアログの外 —— へ抜ける。
  const tabFromLast = (extra: React.ReactNode) => {
    const { getByTestId } = render(
      <Modal open onClose={() => {}} title="親">
        <button data-testid="last">末尾</button>
        {extra}
      </Modal>,
    );
    const last = getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    return last;
  };

  // querySelectorAll の `button:not([disabled])` の枝が先に当たるので、
  // 末尾の `[tabindex]:not([tabindex="-1"])` では tabindex=-1 の button を弾けない。
  it("tabindex=-1 の button は最後の要素として扱われない", () => {
    const last = tabFromLast(
      <button data-testid="skipped" tabIndex={-1}>
        Tab 順の外
      </button>,
    );
    expect(document.activeElement).not.toBe(last);
  });

  it("hidden 属性の付いた要素は候補に入らない", () => {
    const last = tabFromLast(
      <button data-testid="hidden-btn" hidden>
        隠れている
      </button>,
    );
    expect(document.activeElement).not.toBe(last);
  });
});
