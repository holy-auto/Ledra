// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProgressCard from "../ProgressCard";

describe("ProgressCard", () => {
  it("件数とパーセントを描画し progressbar の aria を持つ", () => {
    const { container, getByText } = render(<ProgressCard label="今日の進捗" completed={3} total={8} />);
    expect(getByText("今日の進捗")).toBeDefined();
    expect(getByText("3")).toBeDefined();
    expect(getByText("/ 8")).toBeDefined();
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("38"); // 3/8 = 37.5 → 四捨五入38
    expect(bar?.getAttribute("aria-valuemin")).toBe("0");
    expect(bar?.getAttribute("aria-valuemax")).toBe("100");
    expect(getByText("38%")).toBeDefined();
  });

  it("total=0 はゼロ除算せず 0% になる", () => {
    const { container, getByText } = render(<ProgressCard label="x" completed={0} total={0} />);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0");
    expect(getByText("0%")).toBeDefined();
  });

  it("completed > total でも 100% を超えない", () => {
    const { container } = render(<ProgressCard label="x" completed={9} total={8} />);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("percent 指定で件数比と独立した進捗率を表示できる(Step 比率平均等)", () => {
    const { container, getByText } = render(<ProgressCard label="今日" completed={2} total={4} percent={62.5} />);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("63");
    expect(getByText("2")).toBeDefined(); // 件数表示は completed/total のまま
    expect(getByText("63%")).toBeDefined();
  });

  it("percent は 0-100 にクランプされる", () => {
    const over = render(<ProgressCard label="x" completed={0} total={0} percent={150} />).container;
    expect(over.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    const under = render(<ProgressCard label="x" completed={0} total={0} percent={-5} />).container;
    expect(under.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0");
  });

  it("caption と children を描画する", () => {
    const { getByText } = render(
      <ProgressCard label="x" completed={1} total={2} caption="平均完了率">
        <span>補助</span>
      </ProgressCard>,
    );
    expect(getByText("平均完了率")).toBeDefined();
    expect(getByText("補助")).toBeDefined();
  });
});
