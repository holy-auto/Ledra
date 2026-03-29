// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "../StatCard";

describe("StatCard", () => {
  it("renders label", () => {
    render(<StatCard label="Total Users" value={150} />);
    expect(screen.getByText("Total Users")).toBeDefined();
  });

  it("renders numeric value", () => {
    render(<StatCard label="Count" value={42} />);
    expect(screen.getByText("42")).toBeDefined();
  });

  it("renders string value", () => {
    render(<StatCard label="Status" value="Active" />);
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders ReactNode value", () => {
    render(
      <StatCard
        label="Revenue"
        value={<span data-testid="formatted">$1,234</span>}
      />,
    );
    expect(screen.getByTestId("formatted")).toBeDefined();
    expect(screen.getByText("$1,234")).toBeDefined();
  });

  it("renders caption when provided", () => {
    render(<StatCard label="Sales" value={100} caption="+12% from last month" />);
    expect(screen.getByText("+12% from last month")).toBeDefined();
  });

  it("does not render caption when not provided", () => {
    const { container } = render(<StatCard label="Sales" value={100} />);
    const captionEl = container.querySelector(".text-xs.text-muted");
    expect(captionEl).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(
      <StatCard label="Test" value={0} className="col-span-2" />,
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain("col-span-2");
    expect(card?.className).toContain("glass-card");
  });

  it("has glass-card base class", () => {
    const { container } = render(<StatCard label="Base" value={0} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain("glass-card");
    expect(card?.className).toContain("p-5");
  });
});
