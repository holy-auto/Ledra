"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatImportSummary, type LaborImportResult } from "@/lib/pricing/laborMaster";
import type { DocumentItem } from "@/types/document";

/**
 * LaborQuoteButton
 * ------------------------------------------------------------
 * 明細の品番（無ければ品名）と型式・支店から、工数マスタで工賃を算出して単価に入れる
 * （`/api/admin/labor-hours/quote`、AI 不使用）。発注書の価格（用品の販売価格）は工賃では
 * ないため、マスタに無い行は 0 円にして「未登録」として知らせる。時間単価は税抜。
 * 未登録の行はその場で工数を入れてマスタに登録できる（型式・品番で重複を確認し、
 * 登録済みと値が違うものは上書きしない）。
 */

type QuoteLine = { key: string; matched: boolean; unit_price: number | null };
type QuoteResponse = { rate_per_hour?: number | null; lines?: QuoteLine[]; message?: string };

interface Props {
  items: DocumentItem[];
  branchId: string;
  modelCode: string;
  onModelCodeChange: (v: string) => void;
  disabled?: boolean;
  /** 応答待ちの間の編集を失わないよう、最新の明細に対する更新関数で渡す */
  onApplied: (update: (latest: DocumentItem[]) => DocumentItem[]) => void;
}

const keyOf = (it: DocumentItem) => (it.item_code || it.description || "").trim();
// 品番があるときの予備キー（品名）。品番で見つからなければこちらで引く
const altOf = (it: DocumentItem) => (it.item_code ? it.description?.trim() || null : null);
// 単価を当てる行の識別。品番が同じでも品名が違えば別行として扱う
const lineIdOf = (it: DocumentItem) => `${keyOf(it)}\u0000${altOf(it) ?? ""}`;

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
  const [missing, setMissing] = useState<{ key: string; label: string }[]>([]);
  const [hoursInput, setHoursInput] = useState<Record<string, string>>({});

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
        body: JSON.stringify({
          model_code: modelCode,
          branch_id: branchId || null,
          keys: targets.map((t) => t.key),
          // 品番で見つからなければ品名でも引く（d-Happy 由来の工数は品名で登録されている）
          alt_keys: targets.map((t) => altOf(items[t.i])),
        }),
      });
      const j = await parseJsonSafe<QuoteResponse>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const lines = j?.lines ?? [];

      // 工数はあるのに時間単価が無い → 0 円で上書きすると消えるだけなので中止する
      if (lines.some((l) => l.matched && l.unit_price == null)) {
        return setMsg("時間単価が未設定です。取引先の支店、または設定画面のレバーレートを入力してください。");
      }

      // 応答待ちの間に明細が編集・追加・削除されても、行位置ではなく照合キーで当てる
      const priceByLine = new Map(targets.map((t, k) => [lineIdOf(items[t.i]), lines[k]?.unit_price ?? 0]));
      const missingLines = targets
        .filter((_, k) => !lines[k]?.matched)
        .map((t) => ({ key: t.key, label: items[t.i].description || t.key }));
      const missing = missingLines.map((m) => m.label);
      setMissing(missingLines);
      onApplied((latest) =>
        latest.map((it) => {
          const price = (it.item_type ?? "item") === "item" ? priceByLine.get(lineIdOf(it)) : undefined;
          return price === undefined ? it : { ...it, unit_price: price, amount: Math.round(it.quantity * price) };
        }),
      );

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

  // 未登録行の工数をマスタへ。CSV 1行に組むため、半角カンマを含む品番・品名は登録できない
  const register = async () => {
    const rows = missing
      .map((m) => ({ ...m, hours: Number(hoursInput[m.key]) }))
      .filter((m) => hoursInput[m.key]?.trim() && Number.isFinite(m.hours) && m.hours >= 0);
    if (rows.length === 0) return setMsg("登録する行の工数（時間）を入力してください");
    if (rows.some((r) => r.key.includes(",")))
      return setMsg("品番・品名に半角カンマがある行は工数マスタ画面から登録してください");
    const csv = rows.map((r) => [modelCode, r.key, r.hours, "", r.label.replace(/,/g, "、"), ""].join(",")).join("\n");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/labor-hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const j = await parseJsonSafe<LaborImportResult & { message?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setHoursInput({});
      setBusy(false);
      await run(); // 登録した工数で計算し直す
      setMsg((prev) => `工数マスタ: ${formatImportSummary(j ?? {})}。${prev ?? ""}`);
    } catch (e) {
      setMsg("工数の登録に失敗しました: " + (e instanceof Error ? e.message : String(e)));
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
      {missing.length > 0 && (
        <span className="flex w-full flex-col gap-1 rounded-lg border border-border-default p-2">
          <span className="text-[11px] text-muted">
            工数未登録の行（型式 {modelCode || "未入力"}）。工数を入れて登録すると次回から自動で算出します。
          </span>
          {missing.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-xs text-secondary">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                className="input-field !w-20 !py-1 text-xs"
                placeholder="工数h"
                value={hoursInput[m.key] ?? ""}
                onChange={(e) => setHoursInput((prev) => ({ ...prev, [m.key]: e.target.value }))}
              />
              <span className="truncate">{m.label}</span>
            </label>
          ))}
          <button
            type="button"
            className="self-start rounded-lg border border-border-default px-3 py-1 text-xs text-secondary hover:border-border-strong disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => void register()}
          >
            工数マスタに登録して再計算
          </button>
        </span>
      )}
    </span>
  );
}
