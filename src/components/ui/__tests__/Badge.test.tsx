// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "../Badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders with default variant when none specified", () => {
    const { container } = render(<Badge>Default</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-surface-hover");
    expect(span?.className).toContain("text-secondary");
  });

  it("renders success variant", () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-success-dim");
    expect(span?.className).toContain("text-success-text");
  });

  it("renders warning variant", () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-warning-dim");
    expect(span?.className).toContain("text-warning-text");
  });

  it("renders danger variant", () => {
    const { container } = render(<Badge variant="danger">Error</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-danger-dim");
    expect(span?.className).toContain("text-danger-text");
  });

  it("renders info variant", () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-accent-dim");
    expect(span?.className).toContain("text-accent-text");
  });

  it("renders violet variant", () => {
    const { container } = render(<Badge variant="violet">Violet</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("bg-violet-dim");
    expect(span?.className).toContain("text-violet-text");
  });

  it("renders complex children", () => {
    render(
      <Badge variant="success">
        <span data-testid="inner">Complex</span>
      </Badge>,
    );
    expect(screen.getByTestId("inner")).toBeDefined();
    expect(screen.getByText("Complex")).toBeDefined();
  });

  it("always applies base classes", () => {
    const { container } = render(<Badge>Base</Badge>);
    const span = container.querySelector("span");
    expect(span?.className).toContain("inline-flex");
    expect(span?.className).toContain("rounded-full");
    expect(span?.className).toContain("border");
  });
});
