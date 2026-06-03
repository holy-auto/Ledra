"use client";

import { useEffect, useState } from "react";

interface ServiceHealth {
  key: string;
  label: string;
  totalCalls: number;
  errorCalls: number;
  errorRatePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  status: "healthy" | "degraded" | "down" | "unknown";
}

interface HealthData {
  services: ServiceHealth[];
  windowHours: number;
  redisAvailable: boolean;
}

function statusDot(status: ServiceHealth["status"]) {
  const base = "inline-block h-2.5 w-2.5 rounded-full flex-shrink-0";
  if (status === "healthy") return <span className={`${base} bg-success`} />;
  if (status === "degraded") return <span className={`${base} bg-warning`} />;
  if (status === "down") return <span className={`${base} bg-danger`} />;
  return <span className={`${base} bg-border-default`} />;
}

function statusText(status: ServiceHealth["status"]) {
  if (status === "healthy") return <span className="text-success text-xs font-medium">正常</span>;
  if (status === "degraded") return <span className="text-warning text-xs font-medium">低下</span>;
  if (status === "down") return <span className="text-danger text-xs font-medium">障害</span>;
  return <span className="text-muted text-xs">データなし</span>;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "1分未満前";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export default function IntegrationHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/platform/integration-health", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          setErr(j?.message ?? "取得に失敗しました");
          return;
        }
        setData(j);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "エラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="glass-card">
      <div className="p-5 border-b border-border-subtle">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">リアルタイム監視</div>
        <div className="mt-1 text-base font-semibold text-primary">外部サービス連携ヘルス</div>
        {data && (
          <div className="text-xs text-muted mt-0.5">過去 {data.windowHours}h の呼び出し実績</div>
        )}
      </div>

      {loading && !data && (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-active animate-pulse" />
          ))}
        </div>
      )}

      {err && !data && (
        <div className="p-6 text-sm text-danger text-center">{err}</div>
      )}

      {data && !data.redisAvailable && (
        <div className="px-5 py-3 bg-warning/10 border-b border-border-subtle">
          <p className="text-xs text-warning-text">Redis 未設定のため、メトリクスデータが蓄積されていません。環境変数 UPSTASH_REDIS_REST_URL / TOKEN を設定するとサービス別の健全性が表示されます。</p>
        </div>
      )}

      {data && (
        <div className="divide-y divide-border-subtle">
          {data.services.map((svc) => (
            <div key={svc.key} className="px-5 py-3 flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-[160px]">
                {statusDot(svc.status)}
                <span className="text-sm text-primary font-medium truncate">{svc.label}</span>
              </div>
              <div className="flex-1 min-w-0">
                {svc.totalCalls > 0 ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-muted">
                      呼出 <span className="text-primary font-semibold">{svc.totalCalls}</span>件
                    </span>
                    {svc.errorCalls > 0 && (
                      <span className="text-xs text-danger">
                        エラー {svc.errorCalls}件 ({svc.errorRatePct}%)
                      </span>
                    )}
                    {svc.avgLatencyMs !== null && (
                      <span className="text-xs text-muted">
                        avg <span className="text-secondary font-medium">{svc.avgLatencyMs}ms</span>
                        {svc.p95LatencyMs !== null && (
                          <span> / p95 {svc.p95LatencyMs}ms</span>
                        )}
                      </span>
                    )}
                    <span className="text-xs text-muted">最終成功: {fmtRelative(svc.lastOkAt)}</span>
                    {svc.lastErrorAt && (
                      <span className="text-xs text-danger">最終エラー: {fmtRelative(svc.lastErrorAt)}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted">過去24hのデータなし</span>
                )}
              </div>
              <div className="flex-shrink-0">{statusText(svc.status)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
