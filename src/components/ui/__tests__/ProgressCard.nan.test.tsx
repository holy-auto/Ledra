// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProgressCard from "../ProgressCard";

// clamp は NaN を素通しする(Math.max(NaN, 0) は NaN)。呼び出し元が
// 空集合の計算をそのまま渡したときに "NaN%" が画面に出ないことを固定する。
describe("ProgressCard — 非有限な進捗率", () => {
  it("percent={0 / 0} でも NaN を描画しない", () => {
    const { container } = render(<ProgressCard label="進捗" completed={0} total={0} percent={0 / 0} />);
    expect(container.textContent).not.toContain("NaN");
    expect(container.querySelector('[aria-valuenow="NaN"]')).toBeNull();
    expect(container.textContent).toContain("0%");
  });

  it("completed が NaN でも NaN を描画しない", () => {
    const { container } = render(<ProgressCard label="進捗" completed={Number.NaN} total={10} />);
    expect(container.querySelector('[aria-valuenow="NaN"]')).toBeNull();
  });

  it("Infinity は 100% に丸められる", () => {
    const { container } = render(
      <ProgressCard label="進捗" completed={5} total={10} percent={Number.POSITIVE_INFINITY} />,
    );
    expect(container.textContent).not.toContain("NaN");
  });
});
