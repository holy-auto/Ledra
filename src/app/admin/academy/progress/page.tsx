"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

interface Badge {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

interface Progress {
  level: number;
  total_score: number;
  lessons_completed: number;
  cases_submitted: number;
  certs_reviewed: number;
  standard_level: string;
  last_activity_at: string | null;
}

interface RecentCompletion {
  lesson_id: string;
  lesson_title: string;
  lesson_level: string | null;
  score_earned: number;
  completed_at: string;
}

interface QualifyingLesson {
  id: string;
  title: string;
  rating_avg: number;
  rating_count: number;
}

interface MvpEntry {
  author_user_id: string;
  tenant_id: string | null;
  tenant_name: string;
  lesson_count: number;
  total_amount_jpy: number;
  period_month: string;
  top_lesson: { id: string; title: string; rating_avg: number; rating_count: number } | null;
}

interface RewardRecord {
  id: string;
  tenant_id: string | null;
  author_user_id: string;
  period_month: string;
  qualifying_lessons: QualifyingLesson[];
  lesson_count: number;
  reward_per_lesson: number;
  total_amount_jpy: number;
  status: "pending" | "applied" | "skipped" | "failed";
  stripe_credit_id: string | null;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
}

const LEVEL_LABEL: Record<string, string> = {
  intro: "入門",
  basic: "基礎",
  standard: "標準",
  pro: "応用",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "処理待ち", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  applied: { label: "適用済", cls: "bg-green-500/15 text-green-600 border-green-500/30" },
  skipped: { label: "スキップ", cls: "bg-muted/20 text-muted border-border-subtle" },
  failed: { label: "失敗", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
};

type Tab = "progress" | "certificates" | "rewards";

interface CertEligibility {
  category: string;
  label: string;
  completed: number;
  threshold: number;
  eligible: boolean;
  latest_at: string | null;
}

export default function AcademyProgressPage() {
  const [activeTab, setActiveTab] = useState<Tab>("progress");

  const [progress, setProgress] = useState<Progress | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [recent, setRecent] = useState<RecentCompletion[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(true);

  const [certs, setCerts] = useState<CertEligibility[]>([]);
  const [certsFetched, setCertsFetched] = useState(false);
  const [downloadingCat, setDownloadingCat] = useState<string | null>(null);

  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [rewardsFetched, setRewardsFetched] = useState(false);

  const [calculating, setCalculating] = useState(false);
  const [calcPeriod, setCalcPeriod] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const [mvp, setMvp] = useState<MvpEntry | null>(null);
  const [runnersUp, setRunnersUp] = useState<MvpEntry[]>([]);
  const [mvpPeriod, setMvpPeriod] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/academy/rankings?type=mvp&limit=3");
        if (!res.ok) return;
        const data = await res.json();
        if (canceled) return;
        setMvp(data.mvp ?? null);
        setRunnersUp(data.runners_up ?? []);
        setMvpPeriod(data.period_month ?? null);
      } catch {
        // noop
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/academy/progress");
        const data = await res.json();
        if (canceled) return;
        if (res.ok) {
          setProgress(data.progress);
          setBadges(data.badges ?? []);
          setRecent(data.recent_completions ?? []);
        }
      } finally {
        if (!canceled) setLoadingProgress(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  async function fetchRewards() {
    setLoadingRewards(true);
    try {
      const res = await fetch("/api/admin/academy/rewards");
      const data = await res.json();
      if (res.ok) {
        setRewards(data.rewards ?? []);
        setIsAdmin(data.is_admin ?? false);
      }
    } finally {
      setLoadingRewards(false);
      setRewardsFetched(true);
    }
  }

  async function fetchCerts() {
    try {
      const res = await fetch("/api/admin/academy/certificates");
      if (!res.ok) return;
      const data = await res.json();
      setCerts(data.categories ?? []);
    } finally {
      setCertsFetched(true);
    }
  }

  async function handleDownloadCert(category: string) {
    setDownloadingCat(category);
    try {
      const res = await fetch(`/api/admin/academy/certificates/${category}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message ?? data.error ?? "ダウンロードに失敗しました");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ledra-academy-${category}-certificate.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingCat(null);
    }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "rewards" && !rewardsFetched) fetchRewards();
    if (tab === "certificates" && !certsFetched) fetchCerts();
  }

  async function handleCalculate() {
    setCalculating(true);
    try {
      const res = await fetch("/api/admin/academy/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_month: calcPeriod }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`集計完了: ${data.inserted} 件追加、${data.skipped_existing} 件スキップ`);
        await fetchRewards();
      } else {
        alert(`エラー: ${data.message ?? data.error ?? "不明なエラー"}`);
      }
    } finally {
      setCalculating(false);
    }
  }

  async function handleApply(rewardId: string) {
    setApplyingId(rewardId);
    try {
      const res = await fetch(`/api/admin/academy/rewards/${rewardId}/apply`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.already_applied) {
          alert("既に適用済みです");
        } else if (data.skipped) {
          alert(`スキップ: ${data.detail}`);
        } else {
          alert(`Stripe credit 適用完了: ${data.stripe_credit_id}`);
        }
        await fetchRewards();
      } else {
        alert(`エラー: ${data.message ?? data.error ?? "不明なエラー"}`);
      }
    } finally {
      setApplyingId(null);
    }
  }

  if (loadingProgress) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-sm text-muted">進捗データの取得に失敗しました</div>
    );
  }

  const currentLevelStart = (progress.level - 1) * 100;
  const nextLevelAt = progress.level * 100;
  const inLevel = Math.max(0, progress.total_score - currentLevelStart);
  const pct = Math.min(100, Math.round((inLevel / 100) * 100));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader
        tag="アカデミー"
        title="学習進捗"
        description="完了したレッスン・施工事例提供で獲得したスコアと、バッジ・報酬を確認できます。"
        actions={
          <Link href="/admin/academy" className="text-sm text-accent hover:underline">
            ← Academy
          </Link>
        }
        tabs={[
          { key: "progress", label: "📊 進捗・バッジ" },
          { key: "certificates", label: "📜 修了証" },
          { key: "rewards", label: "💰 報酬履歴" },
        ]}
        activeTab={activeTab}
        onTabSelect={(key) => handleTabChange(key as Tab)}
      />

      <div className="mt-6" />

      {activeTab === "progress" && (
        <>
          {/* レベル + スコア */}
          <div className="glass-card p-6 mb-6">
            <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
              <div>
                <div className="text-xs text-muted">あなたのレベル</div>
                <div className="text-4xl font-bold text-accent">Lv.{progress.level}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted">累計スコア</div>
                <div className="text-2xl font-semibold text-primary">{progress.total_score} pt</div>
              </div>
            </div>
            <div className="bg-inset rounded-full h-3 overflow-hidden">
              <div className="bg-accent h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-muted mt-2">
              次のレベルまで あと {Math.max(0, nextLevelAt - progress.total_score)} pt
            </div>
          </div>

          {/* 統計 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "完了レッスン", value: progress.lessons_completed, sub: "件" },
              { label: "公開した事例", value: progress.cases_submitted, sub: "件" },
              { label: "添削した証明書", value: progress.certs_reviewed, sub: "件" },
              { label: "Ledra Standard", value: progress.standard_level, sub: "" },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {s.value}
                  {s.sub && <span className="text-sm text-muted ml-1">{s.sub}</span>}
                </div>
                <div className="text-xs text-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* 月間 MVP */}
          {mvp && (
            <div className="glass-card p-5 mb-6 border border-yellow-400/30 bg-yellow-400/5">
              <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <span>👑</span> 月間 MVP 投稿者
                {mvpPeriod && (
                  <span className="text-xs text-muted font-normal">{mvpPeriod.slice(0, 7).replace("-", "年")}月</span>
                )}
              </h2>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-yellow-400 flex items-center gap-2">🥇 {mvp.tenant_name}</div>
                  <div className="text-sm text-secondary mt-1">
                    高評価レッスン {mvp.lesson_count} 件・報酬 ¥{mvp.total_amount_jpy.toLocaleString()}
                  </div>
                  {mvp.top_lesson && (
                    <Link
                      href={`/admin/academy/learn/${mvp.top_lesson.id}`}
                      className="mt-2 block text-xs text-accent hover:underline truncate"
                    >
                      代表作: {mvp.top_lesson.title}
                      <span className="text-muted ml-1">
                        ★{mvp.top_lesson.rating_avg.toFixed(1)} ({mvp.top_lesson.rating_count}件)
                      </span>
                    </Link>
                  )}
                </div>
                {runnersUp.length > 0 && (
                  <div className="shrink-0 text-xs text-muted space-y-1">
                    {runnersUp.map((r, i) => (
                      <div key={r.author_user_id} className="flex items-center gap-1">
                        <span>{["🥈", "🥉"][i] ?? `#${i + 2}`}</span>
                        <span className="text-secondary">{r.tenant_name}</span>
                        <span>({r.lesson_count}件)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* バッジ */}
          <div className="glass-card p-5 mb-6">
            <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
              <span>🎖</span> 獲得バッジ
            </h2>
            {badges.length === 0 ? (
              <p className="text-sm text-muted">まだバッジがありません。レッスン完了や事例公開で獲得できます。</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {badges.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-inset border border-border-subtle"
                  >
                    <span className="text-3xl">{b.emoji}</span>
                    <div>
                      <div className="text-sm font-medium text-primary">{b.label}</div>
                      <div className="text-xs text-muted">{b.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 直近の完了 */}
          <div className="glass-card p-5">
            <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
              <span>🕒</span> 直近の完了
            </h2>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">完了したレッスンはまだありません</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r.lesson_id} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/admin/academy/learn/${r.lesson_id}`}
                      className="flex-1 truncate text-secondary hover:text-accent transition-colors"
                    >
                      {r.lesson_level && (
                        <span className="text-xs px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded mr-2 text-accent">
                          {LEVEL_LABEL[r.lesson_level] ?? r.lesson_level}
                        </span>
                      )}
                      {r.lesson_title}
                    </Link>
                    <span className="text-xs text-muted shrink-0">
                      +{r.score_earned} pt · {new Date(r.completed_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {activeTab === "certificates" && (
        <div>
          <div className="glass-card p-5 mb-6 flex gap-3 items-start">
            <span className="text-2xl">📜</span>
            <div>
              <p className="text-sm text-primary font-medium">カテゴリ別 修了証</p>
              <p className="text-sm text-muted mt-1">
                各カテゴリで <strong>10件以上</strong> のレッスンを完了すると修了証 PDF をダウンロードできます。
              </p>
            </div>
          </div>

          {!certsFetched ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {certs.map((c) => (
                <div
                  key={c.category}
                  className={`glass-card p-5 flex items-center justify-between gap-3 ${
                    c.eligible ? "border-accent/30" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-primary">{c.label}</span>
                      {c.eligible && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-500/15 text-green-600 border border-green-500/30 rounded">
                          取得可
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {c.completed} / {c.threshold} レッスン完了
                    </div>
                    {!c.eligible && (
                      <div className="mt-1.5 h-1.5 bg-inset rounded-full overflow-hidden w-32">
                        <div
                          className="h-1.5 bg-accent rounded-full"
                          style={{ width: `${Math.min(100, (c.completed / c.threshold) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownloadCert(c.category)}
                    disabled={!c.eligible || downloadingCat === c.category}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                      enabled:bg-accent enabled:text-white enabled:border-accent/50 enabled:hover:bg-accent/90"
                  >
                    {downloadingCat === c.category ? (
                      <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>⬇</span>
                    )}
                    {downloadingCat === c.category ? "生成中…" : "PDF"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "rewards" && (
        <div>
          {/* 説明 */}
          <div className="glass-card p-5 mb-6 flex gap-3 items-start">
            <span className="text-2xl">💡</span>
            <div>
              <p className="text-sm text-primary font-medium">高評価レッスンへの報酬制度</p>
              <p className="text-sm text-muted mt-1">
                公開レッスンの平均評価 ★4.0 以上 かつ 評価件数 5件以上 を満たすと、 翌月の請求から{" "}
                <strong>¥500 / レッスン</strong> が減額されます。
              </p>
            </div>
          </div>

          {/* super_admin: 集計操作パネル */}
          {isAdmin && (
            <div className="glass-card p-5 mb-6">
              <h2 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <span>⚙️</span> 月次集計 (管理者)
              </h2>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-muted block mb-1">集計月 (YYYY-MM-01)</label>
                  <input
                    type="date"
                    value={calcPeriod}
                    onChange={(e) => setCalcPeriod(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-border-subtle bg-inset text-sm text-primary"
                  />
                </div>
                <button
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {calculating ? "集計中…" : "集計実行"}
                </button>
              </div>
              <p className="text-xs text-muted mt-2">同じ月を再実行しても既存レコードはスキップされます（冪等）。</p>
            </div>
          )}

          {/* 報酬一覧 */}
          {loadingRewards ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rewards.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-muted">
              報酬履歴はまだありません。
              {!isAdmin && " 高評価レッスンを作成すると月次集計で報酬が発生します。"}
            </div>
          ) : (
            <div className="space-y-3">
              {rewards.map((r) => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
                const [year, month] = r.period_month.split("-");
                return (
                  <div key={r.id} className="glass-card p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-primary">
                            {year}年{month}月
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-muted">
                          対象 {r.lesson_count} レッスン × ¥{r.reward_per_lesson.toLocaleString()}
                        </div>
                        {r.notes && <div className="text-xs text-muted mt-1">{r.notes}</div>}
                        {r.applied_at && (
                          <div className="text-xs text-muted mt-1">
                            適用日: {new Date(r.applied_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-accent">¥{r.total_amount_jpy.toLocaleString()}</div>
                        {isAdmin && r.status === "pending" && (
                          <button
                            onClick={() => handleApply(r.id)}
                            disabled={applyingId === r.id}
                            className="mt-2 px-3 py-1 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                          >
                            {applyingId === r.id ? "適用中…" : "Stripe 適用"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 対象レッスン詳細 */}
                    {r.qualifying_lessons.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-muted cursor-pointer hover:text-secondary">
                          対象レッスン一覧
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {r.qualifying_lessons.map((l) => (
                            <li key={l.id} className="text-xs text-secondary flex justify-between gap-2">
                              <span className="truncate">{l.title}</span>
                              <span className="text-muted shrink-0">
                                ★{l.rating_avg.toFixed(1)} / {l.rating_count}件
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
