// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "../Modal";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Test">
        Content
      </Modal>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Title">
        Body
      </Modal>,
    );
    expect(screen.getByText("My Title")).toBeDefined();
  });

  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Title">
        <p>Modal body content</p>
      </Modal>,
    );
    expect(screen.getByText("Modal body content")).toBeDefined();
  });

  it("has role=dialog with aria-modal and aria-label", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Accessible">
        Content
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Accessible");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Closeable">
        Content
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} title="Backdrop">
        Content
      </Modal>,
    );
    // Backdrop is the div with aria-hidden="true"
    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Escape">
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders footer when provided", () => {
    render(
      <Modal
        open={true}
        onClose={() => {}}
        title="With Footer"
        footer={<button>Save</button>}
      >
        Content
      </Modal>,
    );
    expect(screen.getByText("Save")).toBeDefined();
  });

  it("does not render footer when not provided", () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} title="No Footer">
        Content
      </Modal>,
    );
    // The footer wrapper has border-t class; should not exist
    const footerDiv = container.querySelector(".mt-6.flex.justify-end");
    expect(footerDiv).toBeNull();
  });

  it("sets body overflow to hidden when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Scroll Lock">
        Content
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body overflow when closed", () => {
    const { rerender } = render(
      <Modal open={true} onClose={() => {}} title="Scroll Lock">
        Content
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Modal open={false} onClose={() => {}} title="Scroll Lock">
        Content
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
