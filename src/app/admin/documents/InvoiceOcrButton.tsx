"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { compressToJpeg } from "@/lib/media/compressToJpeg";
import type { DocumentItem } from "@/types/document";

/**
 * InvoiceOcrButton
 * ------------------------------------------------------------
 * 仕入先請求書 / 外注請求書、取引先の発注書・依頼書・商談メモの写真を撮る（または
 * 撮影済み写真を選ぶ）→ OCR (`/api/admin/documents/ocr`) → 明細・件名・備考・日付を
 * 帳票フォームへ下書きとして差し込む。金額の確定・送付は人が行う。
 */

interface OcrHeader {
  supplier_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_jpy: number | null;
  delivery_date: string | null;
  subject: string | null;
  note: string | null;
  is_tax_inclusive: boolean | null;
}
const EMPTY_HEADER: OcrHeader = {
  supplier_name: null,
  invoice_number: null,
  issue_date: null,
  due_date: null,
  total_jpy: null,
  delivery_date: null,
  subject: null,
  note: null,
  is_tax_inclusive: null,
};
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
      // スマホ写真は Vercel の body 上限（4.5MB）を超えうるので送る前に縮める
      const image = await compressToJpeg(file);
      if (!image) throw new Error("画像を読み込めませんでした");
      const form = new FormData();
      form.append("image", image);
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
      onExtracted(items, { ...EMPTY_HEADER, ...j?.header });
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
        📷 {busy ? "取り込み中…" : "書類を撮影して取込"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
