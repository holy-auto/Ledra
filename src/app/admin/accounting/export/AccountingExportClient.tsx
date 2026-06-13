"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";

// ─── 型定義 ──────────────────────────────────────────────────────
type ExportFormat = "freee" | "mfcloud" | "generic";

interface Summary {
  year: number;
  month: number;
  count: number;
  subtotal_total: number;
  tax_total: number;
  grand_total: number;
}

interface PreviewResponse {
  ok: boolean;
  format: ExportFormat;
  summary: Summary;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "freee", label: "freee" },
  { value: "mfcloud", label: "MFクラウド" },
  { value: "generic", label: "汎用 (CSV)" },
];

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

function jpy(n: number): string {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

// 当月をデフォルトに。
const NOW = new Date();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => NOW.getFullYear() - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

// ─── メインコンポーネント ─────────────────────────────────────────
export default function AccountingExportClient() {
  const [year, setYear] = useState<number>(NOW.getFullYear());
  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [format, setFormat] = useState<ExportFormat>("freee");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function fetchPreview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/accounting/export?year=${year}&month=${month}&format=${format}&preview=1`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("preview failed");
      const json = (await res.json()) as PreviewResponse;
      setSummary(json.summary);
    } catch {
      showToast("error", "プレビューの取得に失敗しました");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  // 年月変更時にプレビューを更新 (format は CSV 構造のみ変えるので件数には影響しない)。
  useEffect(() => {
    fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function download() {
    const url = `/api/admin/accounting/export?year=${year}&month=${month}&format=${format}`;
    // ブラウザのダウンロードに委ねる (Content-Disposition: attachment)。
    window.location.href = url;
    showToast("success", "CSVをダウンロードしています");
  }

  const empty = summary != null && summary.count === 0;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        tag="設定"
        title="会計エクスポート"
        description="月次の売上 (入金済み・引渡済みの請求書) を freee / MFクラウド / 汎用CSV 形式で出力します。会計ソフトへの取り込みにご利用ください。"
      />

      <div className="glass-card space-y-5 p-6">
        {/* フォーム */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-secondary">
            年
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            月
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            出力形式
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className={inputCls}>
              {FORMAT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={fetchPreview} disabled={loading} className="btn-secondary disabled:opacity-40">
            プレビュー更新
          </button>
        </div>

        {/* 月次サマリ */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile label="売上合計" value={summary ? jpy(summary.grand_total) : "—"} loading={loading} />
          <SummaryTile label="消費税合計" value={summary ? jpy(summary.tax_total) : "—"} loading={loading} />
          <SummaryTile
            label="件数"
            value={summary ? `${summary.count.toLocaleString("ja-JP")}件` : "—"}
            loading={loading}
          />
        </div>

        {empty && (
          <p className="text-sm text-warning">対象期間に出力できる売上 (入金済み・引渡済みの請求書) がありません。</p>
        )}

        {/* ダウンロード */}
        <div className="flex items-center gap-3 border-t border-border-default pt-4">
          <button onClick={download} disabled={loading || empty} className="btn-primary disabled:opacity-40">
            CSVをダウンロード
          </button>
          <span className="text-xs text-muted">
            {FORMAT_OPTIONS.find((f) => f.value === format)?.label} 形式 / {year}年{month}月
          </span>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ─────────────────────────────────────────────
function SummaryTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold text-primary ${loading ? "opacity-40" : ""}`}>{value}</div>
    </div>
  );
}
