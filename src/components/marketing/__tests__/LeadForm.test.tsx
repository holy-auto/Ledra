// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeadForm } from "../LeadForm";

describe("LeadForm", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: "lead_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders required fields", () => {
    render(<LeadForm source="contact" />);
    expect(screen.getByLabelText(/お名前/)).toBeDefined();
    expect(screen.getByLabelText(/会社名/)).toBeDefined();
    expect(screen.getByLabelText(/役職/)).toBeDefined();
    expect(screen.getByLabelText(/メールアドレス/)).toBeDefined();
  });

  it("posts to /api/marketing/leads with the configured source", async () => {
    render(<LeadForm source="demo" resourceKey="enterprise-overview" />);

    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: "山田 太郎" } });
    fireEvent.change(screen.getByLabelText(/会社名/), { target: { value: "株式会社ABC" } });
    fireEvent.change(screen.getByLabelText(/役職/), { target: { value: "代表" } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "ceo@abc.co.jp" },
    });
    fireEvent.click(screen.getByLabelText(/プライバシーポリシー/));
    fireEvent.click(screen.getByRole("button", { name: /送信する/ }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/marketing/leads");
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("demo");
    expect(body.resource_key).toBe("enterprise-overview");
    expect(body.email).toBe("ceo@abc.co.jp");
    expect(body.consent).toBe(true);
  });

  it("shows success pane after submit", async () => {
    render(<LeadForm source="contact" success={{ title: "送信完了", body: "ありがとうございます。" }} />);
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/会社名/), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText(/役職/), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "a@b.c" },
    });
    fireEvent.click(screen.getByLabelText(/プライバシーポリシー/));
    fireEvent.click(screen.getByRole("button", { name: /送信する/ }));

    await waitFor(() => {
      expect(screen.getByText("送信完了")).toBeDefined();
    });
  });

  it("shows error when server rejects", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "リクエストが多すぎます" }), { status: 429 }),
    );
    render(<LeadForm source="contact" />);
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/会社名/), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText(/役職/), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), {
      target: { value: "a@b.c" },
    });
    fireEvent.click(screen.getByLabelText(/プライバシーポリシー/));
    fireEvent.click(screen.getByRole("button", { name: /送信する/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("リクエストが多すぎます");
    });
  });

  it("renders optional industry/locations/timing fields when configured", () => {
    render(<LeadForm source="document_shop" fields={{ industry: true, locations: true, timing: true }} />);
    expect(screen.getByLabelText(/業態/)).toBeDefined();
    expect(screen.getByLabelText(/拠点数/)).toBeDefined();
    expect(screen.getByLabelText(/検討時期/)).toBeDefined();
  });
});
