// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductTourSection } from "../ProductTourSection";

describe("ProductTourSection", () => {
  it("4クリックで発行完了まで進み、証明書プレビューとCTAが表示される", () => {
    render(<ProductTourSection />);

    fireEvent.click(screen.getByText("ALPHARD"));
    fireEvent.click(screen.getByText("ボディコーティング"));
    fireEvent.click(screen.getByText("証明書を発行する"));

    expect(screen.getByText("証明書を発行しました")).toBeDefined();
    expect(screen.getByText(/ALPHARD の施工証明書/)).toBeDefined();
    expect(screen.getByText("無料で自分の証明書を作ってみる")).toBeDefined();
  });

  it("「もう一度試す」で最初のステップに戻る", () => {
    render(<ProductTourSection />);

    fireEvent.click(screen.getByText("PRIUS"));
    fireEvent.click(screen.getByText("PPF（フィルム施工）"));
    fireEvent.click(screen.getByText("証明書を発行する"));
    fireEvent.click(screen.getByText("もう一度試す"));

    expect(screen.getByText("Step 1 — どの車両ですか？")).toBeDefined();
  });
});
