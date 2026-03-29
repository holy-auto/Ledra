// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../Toast";

// Helper component that triggers toasts via the context
function ToastTrigger({
  message,
  variant,
}: {
  message: string;
  variant?: "success" | "error" | "warning" | "info";
}) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast(message, variant)} data-testid="trigger">
      Trigger
    </button>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders children within ToastProvider", () => {
    render(
      <ToastProvider>
        <div>App Content</div>
      </ToastProvider>,
    );
    expect(screen.getByText("App Content")).toBeDefined();
  });

  it("shows a toast message when triggered", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Hello toast" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Hello toast")).toBeDefined();
  });

  it("shows success toast", () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger message="Saved!" variant="success" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Saved!")).toBeDefined();
    // Check the toast has the success border class
    const toastEl = screen.getByText("Saved!").closest("div[class*='glass-card']");
    expect(toastEl?.className).toContain("border-l-[var(--accent-emerald)]");
  });

  it("shows error toast", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Failed!" variant="error" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Failed!")).toBeDefined();
    const toastEl = screen.getByText("Failed!").closest("div[class*='glass-card']");
    expect(toastEl?.className).toContain("border-l-[var(--accent-red)]");
  });

  it("shows warning toast", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Careful!" variant="warning" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Careful!")).toBeDefined();
    const toastEl = screen.getByText("Careful!").closest("div[class*='glass-card']");
    expect(toastEl?.className).toContain("border-l-[var(--accent-amber)]");
  });

  it("defaults to info variant", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="FYI" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("FYI")).toBeDefined();
    const toastEl = screen.getByText("FYI").closest("div[class*='glass-card']");
    expect(toastEl?.className).toContain("border-l-[var(--accent-blue)]");
  });

  it("auto-dismisses toast after 5 seconds", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Temporary" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Temporary")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Temporary")).toBeNull();
  });

  it("dismisses toast when close button is clicked", () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Dismissable" />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("Dismissable")).toBeDefined();

    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(screen.queryByText("Dismissable")).toBeNull();
  });

  it("can show multiple toasts at once", () => {
    function MultiTrigger() {
      const { toast } = useToast();
      return (
        <>
          <button onClick={() => toast("First")} data-testid="t1">
            T1
          </button>
          <button onClick={() => toast("Second")} data-testid="t2">
            T2
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("t1"));
      fireEvent.click(screen.getByTestId("t2"));
    });
    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });
});
