// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Pagination from "../Pagination";

describe("Pagination", () => {
  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders page numbers for small page count", () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("highlights current page", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    const btn = screen.getByText("2");
    expect(btn.getAttribute("aria-current")).toBe("page");
  });

  it("disables prev button on first page", () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    const prev = screen.getByLabelText("前のページ");
    expect(prev.hasAttribute("disabled")).toBe(true);
  });

  it("disables next button on last page", () => {
    render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    const next = screen.getByLabelText("次のページ");
    expect(next.hasAttribute("disabled")).toBe(true);
  });

  it("calls onPageChange when clicking a page number", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText("3"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("calls onPageChange when clicking next", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText("次のページ"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("calls onPageChange when clicking prev", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText("前のページ"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("shows ellipsis for large page counts", () => {
    render(<Pagination page={5} totalPages={20} onPageChange={() => {}} />);
    const ellipses = screen.getAllByText("…");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("shows first and last page when far from edges", () => {
    render(<Pagination page={10} totalPages={20} onPageChange={() => {}} />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
  });
});
