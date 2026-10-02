"use client";

import { useMemo, useState } from "react";
import { parseMeasurementCsv } from "@/lib/inspection/measurementCsv";
import { getMeasurementField, type IndicatedInspectionForm } from "@/lib/validations/indicated-inspection";

/**
 * 外部テスタ測定値の汎用 CSV 取込パネル。 [G5 / Phase 2 取込UI]
 *
 * 行形式 `field_code,value,unit?` を貼り付け→プレビュー→取込 API へ送信する。
 * 取込は source='imported'・マージ書き込みで、手入力(manual)確定済みセルはサーバ側で保護される。
 * 既存記録（recordId）に対してのみ使う。特定テスタ依存の列マッピングは呼び出し元で正規化する前提。
 */

interface Props {
  recordId: string;
  form: IndicatedInspectionForm;
  onImported: () => void | Promise<void>;
}

export default function CompletionMeasurementCsvImport({ recordId, form, onImported }: Props) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseMeasurementCsv(text, form) : null), [text, form]);

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/inspection-records/${recordId}/measurements/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ measurements: parsed.rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? "取込に失敗しました。");
      setResult({ imported: json?.imported ?? parsed.rows.length, skipped: json?.skipped ?? [] });
      setText("");
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取込に失敗しました。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">外部テスタ取込（CSV）</div>
      <p className="text-[11px] text-muted">
        1行につき <code>field_code,値,単位</code>（単位は省略可）。判定項目は 良/否/該当なし。
        取込は既存の手入力値を上書きしません（保護分はスキップ表示）。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"brake.total,8600,N\nco,0.5\nobd_result,良"}
        className="input w-full font-mono text-[12px]"
      />

      {parsed && (
        <div className="text-[12px] text-secondary">
          取込可能 <span className="font-semibold text-primary">{parsed.rows.length}</span> 件
          {parsed.issues.length > 0 && <span className="text-warning-text">／ 除外 {parsed.issues.length} 件</span>}
          {parsed.rows.length > 0 && (
            <ul className="mt-1 max-h-24 overflow-auto text-[11px] text-muted">
              {parsed.rows.map((r) => (
                <li key={r.field_code}>
                  {getMeasurementField(r.field_code)?.label ?? r.field_code}:{" "}
                  {r.num_value ?? r.text_value ?? r.judgment ?? ""}
                  {r.unit ? ` ${r.unit}` : ""}
                </li>
              ))}
            </ul>
          )}
          {parsed.issues.length > 0 && (
            <ul className="mt-1 max-h-24 overflow-auto text-[11px] text-warning-text">
              {parsed.issues.map((it, i) => (
                <li key={`${it.line}-${i}`}>
                  {it.line}行目 {it.code}: {it.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-lg border-l-4 border-success bg-success/10 p-2 text-[12px] text-success-text">
          取込 {result.imported} 件完了
          {result.skipped.length > 0 &&
            `／ 手入力保護でスキップ ${result.skipped.length} 件（${result.skipped.join(", ")}）`}
        </div>
      )}
      {error && (
        <div className="rounded-lg border-l-4 border-danger bg-danger/10 p-2 text-[12px] text-danger-text">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleImport}
          disabled={importing || !parsed || parsed.rows.length === 0}
          className="btn-ghost text-xs disabled:opacity-50"
        >
          {importing ? "取込中…" : "CSV を取込"}
        </button>
      </div>
    </div>
  );
}
