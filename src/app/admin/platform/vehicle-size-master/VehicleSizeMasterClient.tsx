"use client";

import { useEffect, useState } from "react";

const API = "/api/admin/platform/vehicle-size-master";

const SAMPLE = [
  "maker,model,full_length_mm,full_width_mm,full_height_mm,body_type",
  "トヨタ,クラウンスポーツ,4720,1880,1570,suv",
  "日産,キックス,4290,1760,1605,suv",
].join("\n");

interface ImportResult {
  upserted: number;
  total_rows: number;
  skipped: number;
  errors: string[];
}

export default function VehicleSizeMasterClient() {
  const [total, setTotal] = useState<number | null>(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshTotal() {
    try {
      const res = await fetch(API);
      const json = await res.json();
      if (res.ok && typeof json.total === "number") setTotal(json.total);
    } catch {
      /* 件数取得の失敗は致命的でないため無視 */
    }
  }

  useEffect(() => {
    refreshTotal();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "csv_import", csv }),
      });
      const json = await res.json();
      if (!res.ok) {
        // apiError の body は { error: コード, message: 人間向け }。表示は message を優先。
        setError(json.message || "インポートに失敗しました");
      } else {
        setResult(json as ImportResult);
        refreshTotal();
      }
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-600">現在の登録車種数</div>
        <div className="text-2xl font-bold">{total === null ? "…" : total.toLocaleString("ja-JP")} 車種</div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="text-sm text-gray-700">
          <p className="font-medium">CSV形式</p>
          <p className="mt-1">
            列:{" "}
            <code className="rounded bg-gray-100 px-1">
              maker, model, full_length_mm, full_width_mm, full_height_mm, body_type(任意), size_class(任意)
            </code>
          </p>
          <ul className="mt-2 list-disc pl-5 text-gray-600">
            <li>サイズ区分(SS〜XL)は寸法(全長×全幅×全高)から自動計算します。</li>
            <li>寸法が無い車種は size_class 列に SS〜XL を直接指定できます。</li>
            <li>既存の (メーカー, 車種) は寸法・サイズ区分を上書き更新します(再インポートで補正可)。</li>
            <li>1行目が「maker」または「メーカー」ならヘッダとしてスキップします。</li>
          </ul>
        </div>

        <div className="flex items-center gap-3">
          <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm" />
          <button type="button" onClick={() => setCsv(SAMPLE)} className="text-xs text-blue-600 underline">
            サンプルを挿入
          </button>
        </div>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="ここにCSVを貼り付け、またはファイルを選択"
          rows={12}
          className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
        />

        <button
          type="button"
          onClick={submit}
          disabled={busy || !csv.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "インポート中…" : "CSVをインポート"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-800">
            登録/更新 {result.upserted} 件 / 読込 {result.total_rows} 行 / スキップ {result.skipped} 件
          </p>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-gray-700">
                スキップした行 ({result.errors.length}件, 先頭50件まで)
              </summary>
              <ul className="mt-1 list-disc pl-5 text-gray-600">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
