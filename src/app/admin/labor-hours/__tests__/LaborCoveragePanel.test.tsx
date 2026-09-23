// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import LaborCoveragePanel, { COVERAGE_KEY } from "../LaborCoveragePanel";

function renderWith(data: { registered_rows_by_model: Record<string, number>; vehicle_chassis: string[] }) {
  return render(
    <SWRConfig value={{ fallback: { [COVERAGE_KEY]: data }, fetcher: async () => data, provider: () => new Map() }}>
      <LaborCoveragePanel />
    </SWRConfig>,
  );
}

describe("LaborCoveragePanel", () => {
  it("登録車両と貼り付けた車台番号を型式ごとに出し、未収集を数える", () => {
    renderWith({ registered_rows_by_model: { GP3: 3 }, vehicle_chassis: ["GP3-1017220"] });
    fireEvent.change(screen.getByLabelText("収集したい車台番号"), {
      target: { value: "JF5-1511014\nDG5-1204166, JF5-1405694\n1508937" },
    });
    expect(screen.getByText("未収集 2 型式 / 全 3 型式")).toBeTruthy();
    expect(screen.getByText("未収集の車台番号をコピー（2台）")).toBeTruthy();
    expect(screen.getByText("収集済み（3件）")).toBeTruthy();
    expect(screen.getByText(/型式が分からない番号.*1508937/)).toBeTruthy();
  });
});
