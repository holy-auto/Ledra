"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";

const CSV_HEADERS = ["title", "category", "description", "budget", "deadline", "requester_email", "requester_company"] as const;
type CsvField = typeof CSV_HEADERS[number];

interface CsvRow {
  title: string;
  category: string;
  description: string;
  budget: string;
  deadline: string;
  requester_email: string;
  requester_company: string;
}

interface ParsedRow {
  index: number;
  data: CsvRow;
  errors: string[];
}

interface ImportResult {
  created: number;
  failed: { index: number; title: string; error: string }[];
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const colIndex: Record<string, number> = {};
  for (const field of CSV_HEADERS) {
    const idx = header.indexOf(field);
    colIndex[field] = idx;
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const data: CsvRow = {
      title: get(cols, colIndex["title"]),
      category: get(cols, colIndex["category"]),
      description: get(cols, colIndex["description"]),
      budget: get(cols, colIndex["budget"]),
      deadline: get(cols, colIndex["deadline"]),
      requester_email: get(cols, colIndex["requester_email"]),
      requester_company: get(cols, colIndex["requester_company"]),
    };
    const errors: string[] = [];
    if (!data.title) errors.push("件名(title)は必須です");
    if (data.budget && isNaN(Number(data.budget))) errors.push("予算(budget)は数値で入力してください");
    if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) errors.push("納期(deadline)はYYYY-MM-DD形式で入力してください");
    if (data.requester_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.requester_email)) errors.push("メールアドレスの形式が不正です");
    rows.push({ index: i, data, errors });
  }
  return rows;
}

function get(cols: string[], idx: number): string {
  return idx >= 0 && idx < cols.length ? cols[idx].trim().replace(/^"|"$/g, "") : "";
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

interface Props {
  onImported: () => void;
}

export default function OrderCsvImport({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErr(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file, "UTF-8");
  };

  const validRows = rows.filter((r) => r.errors.length === 0);
  const hasErrors = rows.some((r) => r.errors.length > 0);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setErr(null);
    try {
      const payload = validRows.map((r) => ({
        title: r.data.title,
        category: r.data.category || null,
        description: r.data.description || null,
        budget: r.data.budget ? Number(r.data.budget) : null,
        deadline: r.data.deadline || null,
        requester_email: r.data.requester_email || null,
        requester_company: r.data.requester_company || null,
      }));
      const res = await fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j);
      if (j.created > 0) {
        setRows([]);
        setFileName("");
        if (fileRef.current) fileRef.current.value = "";
        onImported();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const header = CSV_HEADERS.join(",");
    const example = "PPF施工依頼（フロントバンパー）,PPF施工,ランクルフロントバンパー全面,80000,2026-06-30,billing@example.co.jp,株式会社サンプル";
    const blob = new Blob(["﻿" + header + "\n" + example], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "order_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CSVインポート</div>
          <div className="mt-1 text-base font-semibold text-primary">一括発注</div>
          <p className="text-xs text-muted mt-1">
            CSVファイルをアップロードして複数の案件を一括で登録できます。発注先を指定しない案件は公開案件として掲載されます。
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="btn-secondary text-sm cursor-pointer">
            CSVファイルを選択
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
          </label>
          <button type="button" className="text-xs text-accent hover:underline" onClick={downloadTemplate}>
            テンプレートをダウンロード
          </button>
          {fileName && <span className="text-xs text-secondary">{fileName}</span>}
        </div>

        <div className="rounded-lg bg-surface-hover p-3 text-[11px] text-muted space-y-1">
          <p className="font-semibold text-secondary">CSVフォーマット（ヘッダー行必須）</p>
          <p className="font-mono break-all">{CSV_HEADERS.join(", ")}</p>
          <p>必須: title（件名）。その他は任意。budget は数値（円）、deadline は YYYY-MM-DD 形式。</p>
        </div>
      </div>

      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {result && (
        <div className={`glass-card p-4 text-sm ${result.created > 0 ? "text-success" : "text-red-500"}`}>
          {result.created > 0 && <p>{result.created}件のインポートが完了しました。</p>}
          {result.failed.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-red-500 font-medium">失敗した行:</p>
              {result.failed.map((f) => (
                <p key={f.index} className="text-red-400 text-xs">
                  行{f.index}: {f.title} — {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="text-sm font-semibold text-primary">
              プレビュー <span className="text-muted font-normal">（{rows.length}行 / 有効:{validRows.length}行）</span>
            </div>
            {validRows.length > 0 && (
              <Button onClick={handleImport} loading={importing} disabled={importing}>
                {validRows.length}件をインポート
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  <th className="px-3 py-2 text-left text-muted font-medium w-8">#</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">件名</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">カテゴリ</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">予算</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">納期</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">送付先メール</th>
                  <th className="px-3 py-2 text-left text-muted font-medium">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.index}
                    className={row.errors.length > 0 ? "bg-red-500/5" : "hover:bg-surface-hover"}
                  >
                    <td className="px-3 py-2 text-muted">{row.index}</td>
                    <td className="px-3 py-2 text-primary font-medium max-w-[200px] truncate">{row.data.title || "—"}</td>
                    <td className="px-3 py-2 text-secondary">{row.data.category || "—"}</td>
                    <td className="px-3 py-2 text-secondary">
                      {row.data.budget ? `¥${Number(row.data.budget).toLocaleString("ja-JP")}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-secondary">{row.data.deadline || "—"}</td>
                    <td className="px-3 py-2 text-secondary max-w-[160px] truncate">{row.data.requester_email || "—"}</td>
                    <td className="px-3 py-2">
                      {row.errors.length > 0 ? (
                        <span className="text-red-500" title={row.errors.join(", ")}>
                          エラー ({row.errors.length})
                        </span>
                      ) : (
                        <span className="text-success">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasErrors && (
            <div className="px-5 py-3 border-t border-border bg-red-500/5 space-y-1">
              <p className="text-xs font-semibold text-red-500">エラーがある行はインポートされません:</p>
              {rows.filter((r) => r.errors.length > 0).map((r) => (
                <p key={r.index} className="text-[11px] text-red-400">
                  行{r.index}: {r.errors.join(" / ")}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
