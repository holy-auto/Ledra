// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PageHeader from "../PageHeader";

describe("PageHeader", () => {
  it("renders the tag text", () => {
    render(<PageHeader tag="DASHBOARD" title="Overview" />);
    expect(screen.getByText("DASHBOARD")).toBeDefined();
  });

  it("renders the title as an h1", () => {
    render(<PageHeader tag="Section" title="Page Title" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Page Title");
  });

  it("renders description when provided", () => {
    render(<PageHeader tag="Settings" title="Preferences" description="Manage your account settings" />);
    expect(screen.getByText("Manage your account settings")).toBeDefined();
  });

  it("does not render description paragraph when not provided", () => {
    const { container } = render(<PageHeader tag="Settings" title="Preferences" />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders actions when provided", () => {
    render(<PageHeader tag="Users" title="User List" actions={<button>Add User</button>} />);
    expect(screen.getByText("Add User")).toBeDefined();
  });

  it("does not render actions wrapper when not provided", () => {
    const { container } = render(<PageHeader tag="Users" title="User List" />);
    // Only the left-side div should exist as direct child
    const wrapper = container.firstElementChild;
    expect(wrapper?.children.length).toBe(1);
  });

  it("renders multiple action elements", () => {
    render(
      <PageHeader
        tag="Orders"
        title="Orders"
        actions={
          <>
            <button>Export</button>
            <button>Create</button>
          </>
        }
      />,
    );
    expect(screen.getByText("Export")).toBeDefined();
    expect(screen.getByText("Create")).toBeDefined();
  });

  it("does not render a tablist when no tabs are given", () => {
    render(<PageHeader tag="Users" title="User List" />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("marks only the active tab as aria-selected", () => {
    render(
      <PageHeader
        tag="Orders"
        title="Orders"
        tabs={[
          { key: "my", label: "自社" },
          { key: "browse", label: "公開" },
        ]}
        activeTab="browse"
      />,
    );
    expect(screen.getByRole("tab", { name: "自社" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "公開" }).getAttribute("aria-selected")).toBe("true");
  });

  it("fires onTabSelect with the tab key when a button tab is clicked", () => {
    const onTabSelect = vi.fn();
    render(
      <PageHeader
        tag="Orders"
        title="Orders"
        tabs={[
          { key: "my", label: "自社" },
          { key: "csv", label: "CSV" },
        ]}
        activeTab="my"
        onTabSelect={onTabSelect}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "CSV" }));
    expect(onTabSelect).toHaveBeenCalledWith("csv");
  });

  it("renders a tab with href as a link, not a button", () => {
    render(
      <PageHeader tag="Nav" title="Nav" tabs={[{ key: "a", label: "詳細", href: "/admin/x?tab=a" }]} activeTab="a" />,
    );
    const tab = screen.getByRole("tab", { name: "詳細" });
    expect(tab.tagName).toBe("A");
    expect(tab.getAttribute("href")).toBe("/admin/x?tab=a");
  });
});
