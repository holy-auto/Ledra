// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardWidgets from "../DashboardWidgets";

const widgets = [{ id: "a", label: "Widget A", content: <div>A content</div> }];

describe("DashboardWidgets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to defaults instead of throwing on malformed persisted state", () => {
    localStorage.setItem("dashboard-widgets-test-portal", JSON.stringify({}));
    expect(() => render(<DashboardWidgets portal="test-portal" widgets={widgets} />)).not.toThrow();
    expect(screen.getByText("A content")).toBeTruthy();
  });

  it("falls back to defaults on non-JSON persisted state", () => {
    localStorage.setItem("dashboard-widgets-test-portal", "not json");
    expect(() => render(<DashboardWidgets portal="test-portal" widgets={widgets} />)).not.toThrow();
    expect(screen.getByText("A content")).toBeTruthy();
  });

  it("still uses valid persisted state", () => {
    localStorage.setItem("dashboard-widgets-test-portal", JSON.stringify({ order: ["a"], visible: { a: true } }));
    render(<DashboardWidgets portal="test-portal" widgets={widgets} />);
    expect(screen.getByText("A content")).toBeTruthy();
  });
});
