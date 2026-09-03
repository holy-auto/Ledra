// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatusBadge from "../StatusBadge";
import { CERTIFICATE_STATUS_MAP, NFC_STATUS_MAP } from "@/lib/statusMaps";

describe("StatusBadge", () => {
  it("statusMaps のエントリでラベルと variant を描画する", () => {
    const { container, getByText } = render(<StatusBadge map={CERTIFICATE_STATUS_MAP} status="active" />);
    expect(getByText("有効")).toBeDefined();
    expect(container.querySelector("span")?.className).toContain("bg-success-dim");
  });

  it("大文字小文字を無視して解決する(getStatusEntry 仕様)", () => {
    const { getByText } = render(<StatusBadge map={CERTIFICATE_STATUS_MAP} status="VOID" />);
    expect(getByText("無効")).toBeDefined();
  });

  it("未知のステータスは生ラベル + default でフォールバック", () => {
    const { container, getByText } = render(<StatusBadge map={CERTIFICATE_STATUS_MAP} status="mystery" />);
    expect(getByText("mystery")).toBeDefined();
    expect(container.querySelector("span")?.className).toContain("bg-surface-hover");
  });

  it("null は '-' を表示する", () => {
    const { getByText } = render(<StatusBadge map={CERTIFICATE_STATUS_MAP} status={null} />);
    expect(getByText("-")).toBeDefined();
  });

  it("statusMaps の任意のマップで全キーが描画できる(NFC)", () => {
    for (const [key, entry] of Object.entries(NFC_STATUS_MAP)) {
      const { getByText } = render(<StatusBadge map={NFC_STATUS_MAP} status={key} />);
      expect(getByText(entry.label)).toBeDefined();
    }
  });

  it("dot でドットが付く", () => {
    const { container } = render(<StatusBadge map={CERTIFICATE_STATUS_MAP} status="active" dot />);
    expect(container.querySelector('[aria-hidden="true"]')?.className).toContain("rounded-full");
  });
});
