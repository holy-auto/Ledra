import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { AgentProposalCover, type CoverData } from "../AgentProposalCover";

function render(data: CoverData) {
  const el = React.createElement(AgentProposalCover, { data }) as unknown as React.ReactElement<DocumentProps>;
  return renderToBuffer(el);
}

describe("AgentProposalCover rendering", () => {
  it("renders a full cover (会社名・担当者・提案日・メモ) to a non-empty PDF buffer", async () => {
    const buf = await render({
      materialTitle: "Ledra サービス紹介資料",
      companyName: "株式会社テスト",
      contactName: "山田 太郎",
      proposalDate: "2026-06-12",
      agentName: "デモ代理店株式会社",
      memo: "ご検討よろしくお願いいたします。",
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    // PDF files start with %PDF-
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 60_000);

  it("renders with only the required fields (no proposalDate / memo)", async () => {
    const buf = await render({
      materialTitle: "料金プラン・機能比較表",
      companyName: "合同会社サンプル",
      contactName: "佐藤 花子",
      agentName: "デモ代理店株式会社",
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 60_000);
});
