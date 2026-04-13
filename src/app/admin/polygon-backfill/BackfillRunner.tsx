"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  pending: number;
  anchored: number;
  enabled: boolean;
  network: string;
  max_batch_size: number;
};

type RunResult = {
  processed: number;
  anchored: number;
  failed: number;
  results: Array<{
    id: string;
    sha256_prefix: string;
    status: "anchored" | "failed" | "skipped";
    tx_hash?: string | null;
    network?: string | null;
    error?: string;
  }>;
};

export default function BackfillRunner({ enabled }: { enabled: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(10);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/polygon/backfill", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "残件数の取得に失敗しました。");
      } else {
        setStats({
          pending: json.pending ?? 0,
          anchored: json.anchored ?? 0,
          enabled: Boolean(json.enabled),
          network: json.network ?? "polygon",
          max_batch_size: json.max_batch_size ?? 20,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function runBatch() {
    if (!enabled) {
      setError("Polygon アンカーが無効化されています。");
      return;
    }
    setRunning(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await fetch("/api/admin/polygon/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "バックフィルに失敗しました。");
      } else {
        setLastRun({
          processed: json.processed ?? 0,
          anchored: json.anchored ?? 0,
          failed: json.failed ?? 0,
          results: Array.isArray(json.results) ? json.results : [],
        });
        // 残件数を更新
        await fetchStats();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">QUEUE</div>
          <div className="mt-1 text-lg font-semibold text-primary">残件数</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-base p-4">
            <div className="text-xs text-muted">未記録</div>
            <div className="mt-1 text-2xl font-semibold text-amber-400">
              {loading ? "…" : (stats?.pending ?? 0)}
            </div>
            <div className="text-xs text-muted">件</div>
          </div>
          <div className="rounded-xl bg-base p-4">
            <div className="text-xs text-muted">記録済</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-400">
              {loading ? "…" : (stats?.anchored ?? 0)}
            </div>
            <div className="text-xs text-muted">件</div>
          </div>
          <div className="rounded-xl bg-base p-4">
            <div className="text-xs text-muted">最大バッチサイズ</div>
            <div className="mt-1 text-2xl font-semibold text-primary">
              {stats?.max_batch_size ?? 20}
            </div>
            <div className="text-xs text-muted">件/リクエスト</div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">このバッチの件数</label>
            <input
              type="number"
              min={1}
              max={stats?.max_batch_size ?? 20}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(stats?.max_batch_size ?? 20, Number(e.target.value) || 1)))}
              className="w-28 rounded-lg border border-border-default bg-base px-3 py-2 text-sm text-primary"
            />
          </div>
          <button
            type="button"
            onClick={runBatch}
            disabled={running || !enabled || (stats?.pending ?? 0) === 0}
            className="btn-primary"
          >
            {running ? "記録中…" : `${limit} 件をアンカリング`}
          </button>
          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            className="btn-secondary"
          >
            残件数を再取得
          </button>
        </div>

        {!enabled ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
            POLYGON_ANCHOR_ENABLED が無効です。環境変数を true に設定してください。
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}
      </section>

      {lastRun ? (
        <section className="glass-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">LAST RUN</div>
              <div className="mt-1 text-lg font-semibold text-primary">最終実行結果</div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-neutral-500/10 px-2.5 py-1 text-muted">
                処理 {lastRun.processed}
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                成功 {lastRun.anchored}
              </span>
              {lastRun.failed > 0 ? (
                <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-red-400">
                  失敗 {lastRun.failed}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {lastRun.results.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border-default bg-base p-3 text-xs flex items-center gap-3"
              >
                <span
                  className={
                    r.status === "anchored"
                      ? "text-emerald-400"
                      : r.status === "failed"
                        ? "text-red-400"
                        : "text-muted"
                  }
                >
                  {r.status === "anchored" ? "✓" : r.status === "failed" ? "✗" : "—"}
                </span>
                <span className="font-mono text-muted">{r.sha256_prefix || "-"}</span>
                {r.tx_hash && r.network ? (
                  <a
                    href={`https://${r.network === "amoy" ? "amoy." : ""}polygonscan.com/tx/${r.tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-emerald-400 hover:underline break-all"
                  >
                    {r.tx_hash.slice(0, 16)}… ↗
                  </a>
                ) : r.error ? (
                  <span className="ml-auto text-red-400 break-all">{r.error}</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
