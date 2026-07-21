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

  it("rejects a persisted order with duplicate ids instead of rendering the widget twice", () => {
    localStorage.setItem("dashboard-widgets-test-portal", JSON.stringify({ order: ["a", "a"], visible: { a: true } }));
    render(<DashboardWidgets portal="test-portal" widgets={widgets} />);
    expect(screen.getAllByText("A content")).toHaveLength(1);
  });

  it("rejects a persisted visibility map with non-boolean values", () => {
    // A stale/malformed string "false" is truthy in JS -- if this isn't
    // rejected, the widget renders even though it's meant to be hidden.
    const hiddenByDefault = [{ id: "b", label: "Widget B", content: <div>B content</div>, defaultVisible: false }];
    localStorage.setItem("dashboard-widgets-test-portal", JSON.stringify({ order: ["b"], visible: { b: "false" } }));
    render(<DashboardWidgets portal="test-portal" widgets={hiddenByDefault} />);
    expect(screen.queryByText("B content")).toBeNull();
  });
});
