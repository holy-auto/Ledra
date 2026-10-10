"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MatchResult = {
  tenant_id: string;
  name: string;
  score: number;
  breakdown: {
    categoryMatch: number;
    contractActive: number;
    caseVolume: number;
    regionMatch: number;
    rating: number;
  };
  recommendation: string | null;
};

const CATEGORY_OPTIONS = ["ppf", "coating", "tint", "detailing", "ceramic", "repair"];
const PREFECTURE_OPTIONS = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

export default function BtobMatchPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [prefecture, setPrefecture] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    });
  }, [supabase]);

  function toggleCategory(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function runMatch() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/insurer/btob-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories, prefecture: prefecture || null, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "マッチングに失敗しました");
      setResults(data.matches);
      setTotalCandidates(data.total_candidates);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-secondary">
          BtoB マッチング
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">施工店マッチング</h1>
        <p className="text-sm text-muted">対応カテゴリとエリアを指定して、最適な提携施工店候補を AI が提案します。</p>
      </header>

      {/* 検索条件 */}
      <section className="rounded-2xl border border-border-default bg-surface p-6 space-y-5">
        <h2 className="text-base font-semibold text-primary">マッチング条件</h2>

        <div>
          <label className="mb-2 block text-sm font-medium text-secondary">
            対応カテゴリ <span className="text-xs text-muted">（複数選択可）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  categories.includes(cat)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-default bg-surface text-secondary hover:border-border-strong"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">エリア（都道府県）</label>
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="w-full max-w-xs rounded-xl border border-border-default px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">指定なし（全国）</option>
            {PREFECTURE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <button onClick={runMatch} disabled={loading} className="btn-primary disabled:opacity-50">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              マッチング中…
            </span>
          ) : (
            "マッチング実行"
          )}
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {results !== null && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary">
              マッチング結果{" "}
              <span className="text-sm font-normal text-muted">({totalCandidates} 件の候補から絞り込み)</span>
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-border-default bg-surface p-10 text-center text-sm text-muted">
              条件に合う施工店が見つかりませんでした。条件を緩和してお試しください。
            </div>
          ) : (
            results.map((r, idx) => (
              <div
                key={r.tenant_id}
                className={`rounded-2xl border bg-surface p-5 space-y-3 ${
                  idx === 0 ? "border-accent/40" : idx === 1 ? "border-border-strong" : "border-border-default"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {idx < 3 && <span className="text-lg font-bold text-accent">#{idx + 1}</span>}
                      <h3 className="text-base font-semibold text-primary">{r.name}</h3>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-primary">
                      {r.score} <span className="text-sm font-normal text-muted">点</span>
                    </div>
                  </div>
                </div>

                {/* スコア内訳 */}
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  {[
                    { label: "カテゴリ", value: r.breakdown.categoryMatch, max: 40 },
                    { label: "契約実績", value: r.breakdown.contractActive, max: 20 },
                    { label: "案件量", value: r.breakdown.caseVolume, max: 0 },
                    { label: "エリア", value: r.breakdown.regionMatch, max: 20 },
                    { label: "評価", value: r.breakdown.rating, max: 20 },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-border-default bg-surface-hover px-2 py-1.5 text-center"
                    >
                      <div className="text-[10px] text-muted">{label}</div>
                      <div className={`font-semibold ${value < 0 ? "text-red-400" : "text-primary"}`}>
                        {value > 0 ? "+" : ""}
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI 推薦文 */}
                {r.recommendation && (
                  <div className="rounded-xl border border-accent/30 bg-accent-dim px-4 py-3 text-sm text-primary">
                    {r.recommendation}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
