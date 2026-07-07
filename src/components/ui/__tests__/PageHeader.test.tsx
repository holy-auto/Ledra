// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PageHeader, { type PageHeaderTab } from "../PageHeader";
import AdminPageBar, { PageBarProvider } from "../PageBar";

// PageHeader は「見た目を持たず」内容を PageBar コンテキストへ publish し、
// 実描画は AdminPageBar が行う。両者を一緒にレンダーして結合で検証する。
function renderBar(props: {
  tag?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: PageHeaderTab[];
  activeTab?: string;
  onTabSelect?: (k: string) => void;
}) {
  return render(
    <PageBarProvider>
      <PageHeader {...props} />
      <AdminPageBar />
    </PageBarProvider>,
  );
}

describe("PageHeader → AdminPageBar", () => {
  it("renders the title as an h1 in the bar", () => {
    renderBar({ tag: "Section", title: "Page Title" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page Title");
  });

  it("does not render the eyebrow tag (redundant with the global breadcrumb)", () => {
    renderBar({ tag: "DASHBOARD", title: "Overview" });
    expect(screen.queryByText("DASHBOARD")).toBeNull();
  });

  it("renders description when provided", () => {
    renderBar({ tag: "Settings", title: "Preferences", description: "Manage your account settings" });
    expect(screen.getByText("Manage your account settings")).toBeDefined();
  });

  it("renders actions when provided", () => {
    renderBar({ tag: "Users", title: "User List", actions: <button>Add User</button> });
    expect(screen.getByText("Add User")).toBeDefined();
  });

  it("renders nothing when no PageHeader has published (no empty bar)", () => {
    const { container } = render(
      <PageBarProvider>
        <AdminPageBar />
      </PageBarProvider>,
    );
    expect(container.querySelector("h1")).toBeNull();
  });

  it("does not render a tablist when no tabs are given", () => {
    renderBar({ tag: "Users", title: "User List" });
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("marks only the active tab as aria-selected", () => {
    renderBar({
      tag: "Orders",
      title: "Orders",
      tabs: [
        { key: "my", label: "自社" },
        { key: "browse", label: "公開" },
      ],
      activeTab: "browse",
    });
    expect(screen.getByRole("tab", { name: "自社" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "公開" }).getAttribute("aria-selected")).toBe("true");
  });

  it("fires onTabSelect with the tab key when a button tab is clicked", () => {
    const onTabSelect = vi.fn();
    renderBar({
      tag: "Orders",
      title: "Orders",
      tabs: [
        { key: "my", label: "自社" },
        { key: "csv", label: "CSV" },
      ],
      activeTab: "my",
      onTabSelect,
    });
    fireEvent.click(screen.getByRole("tab", { name: "CSV" }));
    expect(onTabSelect).toHaveBeenCalledWith("csv");
  });

  it("renders a tab with href as a link, not a button", () => {
    renderBar({
      tag: "Nav",
      title: "Nav",
      tabs: [{ key: "a", label: "詳細", href: "/admin/x?tab=a" }],
      activeTab: "a",
    });
    const tab = screen.getByRole("tab", { name: "詳細" });
    expect(tab.tagName).toBe("A");
    expect(tab.getAttribute("href")).toBe("/admin/x?tab=a");
  });
});
