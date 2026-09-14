"use client";

/**
 * 塗膜厚レポート詳細ページに常設する AI 異常検知パネル。
 *
 * - 統計判定 (平均 / 標準偏差 / 外れ値 / 想定値域逸脱) は ai_anomaly route が
 *   サーバ側で deterministic に走らせ、severity を返す。
 * - 表示は severity に応じた色つき。alert/watch のときだけ AI コメント文を出す。
 *
 * 想定値域 (expected_range) はオプション。バナー上のフォームで min/max を
 * 入れて再評価できる。
 */
import { useEffect, useState } from "react";

interface Stats {
  count: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  outliers: Array<{ index: number; value: number; z: number; location?: string }>;
  outOfRange: Array<{ index: number; value: number; location?: string }>;
}

interface Anomaly {
  stats: Stats;
  severity: "ok" | "watch" | "alert";
  comment: string;
  ai: boolean;
}

const SEVERITY_TONE: Record<Anomaly["severity"], string> = {
  ok: "border-success/30 bg-success-dim text-success-text",
  watch: "border-amber-300 bg-amber-50 text-amber-900",
  alert: "border-red-300 bg-red-50 text-red-900",
};

const SEVERITY_LABEL: Record<Anomaly["severity"], string> = {
  ok: "問題なし",
  watch: "要観察",
  alert: "要対応",
};

export default function ThicknessAiAnomalyPanel({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");

  const run = async (range?: { min: number; max: number }) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/thickness-reports/${reportId}/ai-anomaly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range ? { expected_range: range } : {}),
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Standard プラン以上で利用可");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール制限に達しました");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "解析に失敗しました");
        return;
      }
      setAnomaly(j.anomaly);
    } catch {
      setErr("通信エラー");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  function applyRange() {
    const min = Number(rangeMin);
    const max = Number(rangeMax);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      run({ min, max });
    }
  }

  if (err) {
    return <div className="rounded-xl border border-border-default bg-surface px-3 py-2 text-xs text-muted">{err}</div>;
  }
  if (loading && !anomaly) {
    return (
      <div className="rounded-xl border border-border-default bg-surface px-3 py-2 text-xs text-muted">
        AI 異常検知中…
      </div>
    );
  }
  if (!anomaly) return null;

  return (
    <section className={`rounded-xl border px-4 py-3 space-y-3 ${SEVERITY_TONE[anomaly.severity]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>✨ AI 異常検知:</span>
          <span>{SEVERITY_LABEL[anomaly.severity]}</span>
        </div>
        <div className="text-[11px] opacity-80">
          測定 {anomaly.stats.count} 件 / 平均 {anomaly.stats.mean}μm / σ {anomaly.stats.stddev}μm
        </div>
      </div>

      {anomaly.comment && <p className="text-sm">{anomaly.comment}</p>}

      <div className="grid gap-2 sm:grid-cols-2 text-[11px] opacity-90">
        {anomaly.stats.outliers.length > 0 && (
          <div>
            <div className="font-medium">外れ値 ({anomaly.stats.outliers.length}):</div>
            <ul className="list-disc list-inside">
              {anomaly.stats.outliers.slice(0, 5).map((o, i) => (
                <li key={i}>
                  {o.value}μm (z={o.z.toFixed(2)}) {o.location ? `· ${o.location}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {anomaly.stats.outOfRange.length > 0 && (
          <div>
            <div className="font-medium">想定値域逸脱 ({anomaly.stats.outOfRange.length}):</div>
            <ul className="list-disc list-inside">
              {anomaly.stats.outOfRange.slice(0, 5).map((o, i) => (
                <li key={i}>
                  {o.value}μm {o.location ? `· ${o.location}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="opacity-80">想定値域 (μm):</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="min"
          value={rangeMin}
          onChange={(e) => setRangeMin(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface text-primary px-2 py-1 text-xs w-20"
        />
        <span>〜</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="max"
          value={rangeMax}
          onChange={(e) => setRangeMax(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface text-primary px-2 py-1 text-xs w-20"
        />
        <button type="button" onClick={applyRange} disabled={loading} className="btn-ghost text-[11px] py-1 px-2">
          {loading ? "..." : "再評価"}
        </button>
      </div>
    </section>
  );
}
