"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import type { DocumentItem } from "@/types/document";

/**
 * LaborQuoteButton
 * ------------------------------------------------------------
 * 明細の品番（無ければ品名）と型式・支店から、工数マスタで工賃を算出して単価に入れる
 * （`/api/admin/labor-hours/quote`、AI 不使用）。発注書の価格（用品の販売価格）は工賃では
 * ないため、マスタに無い行は 0 円にして「未登録」として知らせる。時間単価は税抜。
 */

type QuoteLine = { key: string; matched: boolean; unit_price: number | null };
type QuoteResponse = { rate_per_hour?: number | null; lines?: QuoteLine[]; message?: string };

interface Props {
  items: DocumentItem[];
  branchId: string;
  modelCode: string;
  onModelCodeChange: (v: string) => void;
  disabled?: boolean;
  onApplied: (items: DocumentItem[]) => void;
}

const keyOf = (it: DocumentItem) => (it.item_code || it.description || "").trim();

export default function LaborQuoteButton({
  items,
  branchId,
  modelCode,
  onModelCodeChange,
  disabled,
  onApplied,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    const targets = items
      .map((it, i) => ({ i, key: keyOf(it) }))
      .filter((t) => (items[t.i].item_type ?? "item") === "item" && t.key);
    if (!modelCode.trim()) return setMsg("型式を入力してください（例: GP3）");
    if (targets.length === 0) return setMsg("品番か品名のある明細がありません");

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/labor-hours/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model_code: modelCode, branch_id: branchId || null, keys: targets.map((t) => t.key) }),
      });
      const j = await parseJsonSafe<QuoteResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const lines = j?.lines ?? [];

      // 工数はあるのに時間単価が無い → 0 円で上書きすると消えるだけなので中止する
      if (lines.some((l) => l.matched && l.unit_price == null)) {
        return setMsg("時間単価が未設定です。取引先の支店、または設定画面のレバーレートを入力してください。");
      }

      const next = [...items];
      const missing: string[] = [];
      targets.forEach((t, j2) => {
        const line = lines[j2];
        const unitPrice = line?.unit_price ?? 0;
        if (!line?.matched) missing.push(items[t.i].description || t.key);
        next[t.i] = { ...next[t.i], unit_price: unitPrice, amount: Math.round(next[t.i].quantity * unitPrice) };
      });
      onApplied(next);

      const rate = j?.rate_per_hour ? `（時間単価 ${j.rate_per_hour.toLocaleString()}円）` : "";
      setMsg(
        `${targets.length - missing.length}/${targets.length} 行を算出${rate}` +
          (missing.length > 0 ? `。工数未登録で0円: ${missing.join("、")}` : ""),
      );
    } catch (e) {
      setMsg("工賃の計算に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        type="text"
        className="input-field !w-24 !py-1 text-xs"
        placeholder="型式 GP3"
        aria-label="型式"
        value={modelCode}
        onChange={(e) => onModelCodeChange(e.target.value)}
      />
      <button
        type="button"
        className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-secondary hover:border-border-strong disabled:opacity-50"
        disabled={disabled || busy}
        onClick={() => void run()}
      >
        {busy ? "計算中…" : "🔧 工賃を計算"}
      </button>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </span>
  );
}
