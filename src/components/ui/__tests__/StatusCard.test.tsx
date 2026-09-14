// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatusCard from "../StatusCard";
import { SEVERITIES } from "@/lib/domain/states";
import { SEVERITY_VARIANT_MAP } from "@/lib/statusMaps";

describe("StatusCard", () => {
  it("label / value / caption を描画する", () => {
    const { getByText } = render(<StatusCard label="重大" value={3} caption="要対応の件数" />);
    expect(getByText("重大")).toBeDefined();
    expect(getByText("3")).toBeDefined();
    expect(getByText("要対応の件数")).toBeDefined();
  });

  it("severity で淡色ティントが決まり、ラベルでも伝わる(色のみに依存しない)", () => {
    const { container, getByText } = render(<StatusCard label="重大" value={1} severity="CRITICAL" />);
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-danger-dim");
    expect(card?.className).toContain("text-danger-text");
    expect(getByText("緊急")).toBeDefined();
  });

  it("severity なしでは severity ラベルを出さない", () => {
    const { queryByText } = render(<StatusCard label="情報" value={9} variant="info" />);
    expect(queryByText("要対応")).toBeNull();
    expect(queryByText("通常")).toBeNull();
  });

  it("正準 Severity 5値すべてに variant 対応がある", () => {
    for (const s of SEVERITIES) {
      expect(SEVERITY_VARIANT_MAP[s], s).toBeTruthy();
      const { container } = render(<StatusCard label="x" value={0} severity={s} />);
      expect(container.firstElementChild?.className).toContain("border");
    }
  });

  it("severity 指定なしは variant(既定 default)を使う", () => {
    const { container } = render(<StatusCard label="情報" value={9} variant="info" />);
    expect(container.firstElementChild?.className).toContain("bg-accent-dim");
    const plain = render(<StatusCard label="通常" value={0} />).container;
    expect(plain.firstElementChild?.className).toContain("bg-surface-hover");
  });

  it("icon スロットが描画される", () => {
    const { container } = render(
      <StatusCard label="x" value={0} icon={<svg data-testid="ic" width="18" height="18" />} />,
    );
    expect(container.querySelector('[data-testid="ic"]')).toBeDefined();
  });
});
