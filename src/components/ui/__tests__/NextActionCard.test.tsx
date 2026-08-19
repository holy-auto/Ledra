// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import NextActionCard from "../NextActionCard";

describe("NextActionCard", () => {
  it("タイトル・理由・CTA を描画する", () => {
    const { getByText } = render(
      <NextActionCard
        title="リフト2で作業を開始"
        reason="納期まで2時間・部品到着済み"
        cta={<button>開始する</button>}
      />,
    );
    expect(getByText("リフト2で作業を開始")).toBeDefined();
    expect(getByText("納期まで2時間・部品到着済み")).toBeDefined();
    expect(getByText("開始する")).toBeDefined();
  });

  it("既定 severity は ACTION(info ティント)でラベル「要対応」を表示", () => {
    const { container, getByText } = render(<NextActionCard title="x" />);
    expect(container.querySelector("section")?.className).toContain("bg-accent-dim");
    expect(getByText("要対応")).toBeDefined();
  });

  it("severity CRITICAL で danger ティントと「緊急」ラベル", () => {
    const { container, getByText } = render(<NextActionCard title="x" severity="CRITICAL" />);
    expect(container.querySelector("section")?.className).toContain("bg-danger-dim");
    expect(getByText("緊急")).toBeDefined();
  });

  it("aria-label にアクション名を含む", () => {
    const { container } = render(<NextActionCard title="写真を撮る" />);
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("次のアクション: 写真を撮る");
  });

  it("secondary スロットが描画される", () => {
    const { getByText } = render(<NextActionCard title="x" secondary={<span>次候補: 洗車</span>} />);
    expect(getByText("次候補: 洗車")).toBeDefined();
  });
});
