// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "../Button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeDefined();
  });

  it("applies primary variant class by default", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-primary");
  });

  it("applies secondary variant class", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-secondary");
  });

  it("applies ghost variant class", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-ghost");
  });

  it("applies danger variant class", () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-danger");
  });

  it("applies outline variant class", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("btn-outline");
  });

  it("does not set data-size for default md size", () => {
    render(<Button>Medium</Button>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-size")).toBeNull();
  });

  it("sets data-size for sm", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-size")).toBe("sm");
  });

  it("sets data-size for lg", () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-size")).toBe("lg");
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("is disabled when loading", () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("shows spinner SVG when loading", () => {
    const { container } = render(<Button loading>Saving</Button>);
    const svg = container.querySelector("svg.animate-spin");
    expect(svg).not.toBeNull();
    // children text is still visible inside a span
    expect(screen.getByText("Saving")).toBeDefined();
  });

  it("does not show spinner when not loading", () => {
    const { container } = render(<Button>Normal</Button>);
    const svg = container.querySelector("svg.animate-spin");
    expect(svg).toBeNull();
  });

  it("calls onClick handler when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("appends custom className", () => {
    render(<Button className="extra-class">Styled</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("extra-class");
    expect(btn.className).toContain("btn-primary");
  });
});
