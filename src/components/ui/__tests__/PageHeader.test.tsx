// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    render(
      <PageHeader
        tag="Settings"
        title="Preferences"
        description="Manage your account settings"
      />,
    );
    expect(screen.getByText("Manage your account settings")).toBeDefined();
  });

  it("does not render description paragraph when not provided", () => {
    const { container } = render(
      <PageHeader tag="Settings" title="Preferences" />,
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders actions when provided", () => {
    render(
      <PageHeader
        tag="Users"
        title="User List"
        actions={<button>Add User</button>}
      />,
    );
    expect(screen.getByText("Add User")).toBeDefined();
  });

  it("does not render actions wrapper when not provided", () => {
    const { container } = render(
      <PageHeader tag="Users" title="User List" />,
    );
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
});
