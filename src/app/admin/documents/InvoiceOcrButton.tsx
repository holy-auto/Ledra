"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import type { DocumentItem } from "@/types/document";

/**
 * InvoiceOcrButton
 * ------------------------------------------------------------
 * 仕入先請求書 / 外注請求書の写真を撮る → OCR (`/api/admin/documents/ocr`) →
 * 明細（と支払期日）を帳票フォームへ下書きとして差し込む。証明書フォームの
 * 「膜厚計から取り込み」と同じカメラ直行パターン。金額の確定・送付は人が行う。
 */

interface OcrHeader {
  supplier_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_jpy: number | null;
}
type OcrResponse = {
  status?: "ok" | "skipped";
  items?: DocumentItem[];
  header?: OcrHeader;
  notice?: string;
  message?: string;
};

interface Props {
  disabled?: boolean;
  onExtracted: (items: DocumentItem[], header: OcrHeader) => void;
}

export default function InvoiceOcrButton({ disabled, onExtracted }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handle = async (file: File | null) => {
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/admin/documents/ocr", { method: "POST", body: form });
      const j = await parseJsonSafe<OcrResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.status === "skipped") {
        setMsg(j?.notice ?? "AI 自動入力が停止中のため、手動で入力してください。");
        return;
      }
      const items = Array.isArray(j?.items) ? j!.items! : [];
      if (items.length === 0) {
        setMsg("読み取れる明細が見つかりませんでした。手動で入力してください。");
        return;
      }
      onExtracted(
        items,
        j?.header ?? { supplier_name: null, invoice_number: null, issue_date: null, due_date: null, total_jpy: null },
      );
      setMsg(`${items.length} 行を取り込みました。内容を確認してください。`);
    } catch (e) {
      setMsg("取り込みに失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-secondary hover:border-border-strong ${
          disabled || busy ? "pointer-events-none opacity-50" : ""
        }`}
      >
        📷 {busy ? "取り込み中…" : "請求書を撮影して取込"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            void handle(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </span>
  );
}
