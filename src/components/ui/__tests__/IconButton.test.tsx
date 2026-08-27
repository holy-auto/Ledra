// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import IconButton from "../IconButton";

const icon = (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M4 4h16" />
  </svg>
);

describe("IconButton", () => {
  it("aria-label 必須・既定は ghost / md(44px 正方形)", () => {
    const { container } = render(<IconButton aria-label="閉じる">{icon}</IconButton>);
    const btn = container.querySelector("button");
    expect(btn?.getAttribute("aria-label")).toBe("閉じる");
    expect(btn?.className).toContain("btn-ghost");
    expect(btn?.className).toContain("h-11");
    expect(btn?.className).toContain("w-11");
    expect(btn?.getAttribute("type")).toBe("button");
  });

  it("size sm/lg でクラスが変わる", () => {
    const sm = render(
      <IconButton aria-label="a" size="sm">
        {icon}
      </IconButton>,
    ).container.querySelector("button");
    expect(sm?.className).toContain("h-9");
    const lg = render(
      <IconButton aria-label="a" size="lg">
        {icon}
      </IconButton>,
    ).container.querySelector("button");
    expect(lg?.className).toContain("h-12");
  });

  it("variant outline / danger", () => {
    const o = render(
      <IconButton aria-label="a" variant="outline">
        {icon}
      </IconButton>,
    ).container.querySelector("button");
    expect(o?.className).toContain("btn-outline");
    const d = render(
      <IconButton aria-label="a" variant="danger">
        {icon}
      </IconButton>,
    ).container.querySelector("button");
    expect(d?.className).toContain("btn-danger");
  });

  it("disabled とクリック", () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <IconButton aria-label="a" onClick={onClick}>
        {icon}
      </IconButton>,
    );
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <IconButton aria-label="a" onClick={onClick} disabled>
        {icon}
      </IconButton>,
    );
    expect(container.querySelector("button")?.hasAttribute("disabled")).toBe(true);
  });
});
