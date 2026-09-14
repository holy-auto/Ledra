// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Alert from "../Alert";

describe("Alert", () => {
  it("既定は info で status ロール", () => {
    const { container } = render(<Alert>本文</Alert>);
    const el = container.querySelector('[role="status"]');
    expect(el).toBeDefined();
    expect(el?.className).toContain("bg-accent-dim");
    expect(el?.className).toContain("text-accent-text");
  });

  it("warning / danger は alert ロールになる", () => {
    const w = render(<Alert variant="warning">注意</Alert>).container;
    expect(w.querySelector('[role="alert"]')?.className).toContain("bg-warning-dim");
    const d = render(<Alert variant="danger">危険</Alert>).container;
    expect(d.querySelector('[role="alert"]')?.className).toContain("bg-danger-dim");
  });

  it("success はトークン系ティントで status ロール", () => {
    const { container } = render(<Alert variant="success">完了</Alert>);
    expect(container.querySelector('[role="status"]')?.className).toContain("bg-success-dim");
  });

  it("既定アイコン(svg)が描画される(色のみに依存しない)", () => {
    const { container } = render(<Alert variant="warning">注意</Alert>);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("icon プロップで既定アイコンを差し替えられる", () => {
    const { container } = render(<Alert icon={<span data-testid="custom-icon">!</span>}>本文</Alert>);
    expect(container.querySelector('[data-testid="custom-icon"]')).toBeDefined();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("title と action が描画される", () => {
    const { getByText } = render(
      <Alert title="見出し" action={<button>再試行</button>}>
        本文
      </Alert>,
    );
    expect(getByText("見出し")).toBeDefined();
    expect(getByText("再試行")).toBeDefined();
    expect(getByText("本文")).toBeDefined();
  });
});
