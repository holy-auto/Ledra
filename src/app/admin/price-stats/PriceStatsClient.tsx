"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { formatJpy } from "@/lib/format";

interface RegionStat {
  prefecture: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

interface OverallStat {
  count: number;
  avg: number;
  min: number;
  max: number;
}

const REGION_GROUPS: { name: string; prefectures: string[] }[] = [
  { name: "北海道・東北", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { name: "関東", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  {
    name: "中部",
    prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
  },
  { name: "近畿", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  {
    name: "中国・四国",
    prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
  },
  {
    name: "九州・沖縄",
    prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
  },
];

export default function PriceStatsClient() {
  const [data, setData] = useState<{ regionalStats: RegionStat[]; overall: OverallStat } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/price-stats", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const filteredStats =
    data?.regionalStats.filter((r) => {
      if (selectedRegion === "all") return true;
      const group = REGION_GROUPS.find((g) => g.name === selectedRegion);
      return group?.prefectures.includes(r.prefecture);
    }) ?? [];

  const statsWithData = filteredStats.filter((r) => r.count > 0);
  const displayed = showAll ? filteredStats : statsWithData;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="価格分析"
        title="施工価格の相場"
        description="全国の施工店から収集した施工価格データをもとに、地域ごとの相場を表示します。"
      />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && data && (
        <>
          {/* Overall */}
          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">全体</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">データ数</div>
                <div className="mt-2 text-3xl font-bold text-primary">{data.overall.count.toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted">件の施工価格データ</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">全国平均</div>
                <div className="mt-2 text-3xl font-bold text-accent">{formatJpy(data.overall.avg)}</div>
                <div className="mt-1 text-xs text-muted">施工単価</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">最安値</div>
                <div className="mt-2 text-3xl font-bold text-success">{formatJpy(data.overall.min)}</div>
                <div className="mt-1 text-xs text-muted">全国最安</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">最高値</div>
                <div className="mt-2 text-3xl font-bold text-danger">{formatJpy(data.overall.max)}</div>
                <div className="mt-1 text-xs text-muted">全国最高</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">地域フィルタ</label>
                <select
                  className="select-field"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                >
                  <option value="all">全国</option>
                  {REGION_GROUPS.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="rounded"
                />
                データなしの都道府県も表示
              </label>
            </div>
          </section>

          {/* Regional Stats */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">地域別価格</div>
                <div className="mt-1 text-base font-semibold text-primary">都道府県別 施工価格相場</div>
              </div>
              <div className="text-sm text-muted">{displayed.length} 都道府県</div>
            </div>

            {displayed.length === 0 && (
              <div className="glass-card p-8 text-center text-muted">
                データがありません。施工証明書の発行時に施工価格を入力すると相場データが蓄積されます。
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayed.map((r) => (
                <div key={r.prefecture} className={`glass-card p-4 ${r.count === 0 ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-primary">{r.prefecture}</span>
                    <span className="text-[11px] text-muted">{r.count}件</span>
                  </div>
                  {r.count > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">平均</span>
                        <span className="text-sm font-bold text-accent">{formatJpy(r.avg)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">最安値</span>
                        <span className="text-sm font-medium text-success">{formatJpy(r.min)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">最高値</span>
                        <span className="text-sm font-medium text-danger">{formatJpy(r.max)}</span>
                      </div>
                      {/* Price range bar */}
                      <div className="mt-1">
                        <div className="h-2 rounded-full bg-surface-active overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-success via-accent to-danger"
                            style={{ width: `${Math.min(100, Math.round((r.avg / (data.overall.max || 1)) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted">データなし</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Info */}
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">47都道府県の詳細データ</div>
            <p className="text-sm text-secondary">
              全47都道府県の詳細な相場情報は、オプションプランでご利用いただけます。
              施工証明書の発行時に施工価格を入力することで、相場データが蓄積されます。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
