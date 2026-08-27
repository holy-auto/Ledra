// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import SegmentedControl, { type SegmentItem } from "../SegmentedControl";

const items: SegmentItem<"all" | "active" | "done">[] = [
  { key: "all", label: "すべて", count: 12 },
  { key: "active", label: "作業中" },
  { key: "done", label: "完了" },
];

describe("SegmentedControl", () => {
  it("tablist / tab ロールとアクティブ状態", () => {
    const { container } = render(
      <SegmentedControl items={items} value="active" onChange={() => {}} ariaLabel="状態フィルタ" />,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("状態フィルタ");
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].className).toContain("bg-accent");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[0].getAttribute("tabindex")).toBe("-1");
    expect(tabs[1].getAttribute("tabindex")).toBe("0");
  });

  it("クリックで onChange が呼ばれる", () => {
    const onChange = vi.fn();
    const { getByText } = render(<SegmentedControl items={items} value="all" onChange={onChange} />);
    fireEvent.click(getByText("完了"));
    expect(onChange).toHaveBeenCalledWith("done");
  });

  it("矢印キーで循環移動する(roving tabindex)", () => {
    const onChange = vi.fn();
    const { container } = render(<SegmentedControl items={items} value="done" onChange={onChange} />);
    const list = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("all");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("active");
    fireEvent.keyDown(list, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("count バッジは font-mono で描画される", () => {
    const { container } = render(<SegmentedControl items={items} value="all" onChange={() => {}} />);
    const badge = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "12");
    expect(badge?.className).toContain("font-mono");
  });

  it("既定サイズは lg(44px の最小タッチターゲット、v2.0 §3.4)", () => {
    const { container } = render(<SegmentedControl items={items} value="all" onChange={() => {}} />);
    expect(container.querySelector('[role="tab"]')?.className).toContain("min-h-11");
  });

  it("sm/md は高密度なデスクトップ用に選択できる", () => {
    const md = render(<SegmentedControl items={items} value="all" onChange={() => {}} size="md" />).container;
    expect(md.querySelector('[role="tab"]')?.className).toContain("min-h-9");
    const sm = render(<SegmentedControl items={items} value="all" onChange={() => {}} size="sm" />).container;
    expect(sm.querySelector('[role="tab"]')?.className).toContain("min-h-7");
  });
});
