"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/ui/PageHeader";

interface AcademyCase {
  id: string;
  category: string;
  difficulty: number;
  quality_score: number;
  tags: string[];
  ai_summary: string | null;
  good_points: string[];
  caution_points: string[];
  is_candidate: boolean;
  is_published: boolean;
  /** 自店の事例か。公開事例は匿名化済みなので、サーバがこの真偽値だけを返す。 */
  is_own: boolean;
  view_count: number;
  helpful_count: number;
  created_at: string;
}

/** preview が返す「実際に公開される文面」。 */
interface PreviewContent {
  ai_summary: string | null;
  good_points: string[];
  caution_points: string[];
  tags: string[];
}

const CATEGORIES = [
  { value: "", label: "すべて" },
  { value: "ppf", label: "PPF" },
  { value: "coating", label: "コーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
];

const DIFFICULTY_STARS = (d: number) => "★".repeat(d) + "☆".repeat(5 - d);

const scoreColor = (score: number) =>
  score >= 90
    ? "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
    : score >= 75
      ? "text-success bg-success-dim border border-success/20"
      : score >= 50
        ? "text-accent bg-accent/10 border border-accent/20"
        : "text-muted bg-inset border border-border-subtle";

export default function AcademyCasesPage() {
  const [tab, setTab] = useState<"published" | "candidates">("published");
  const [category, setCategory] = useState("");
  const [cases, setCases] = useState<AcademyCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [knowHowLocked, setKnowHowLocked] = useState(false);
  /** preview で生成した「公開される内容」。案件IDごとに保持する。 */
  const [preview, setPreview] = useState<Record<string, PreviewContent>>({});
  /** 目視確認のチェック。preview を見てから入れてもらう。 */
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  /**
   * preview が返した版の印。publish に持っていく。
   * これが無い／古いと公開は弾かれる（別の人が後から再生成した場合など）。
   */
  const [previewToken, setPreviewToken] = useState<Record<string, string>>({});

  const fetchCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: tab });
      if (category) params.set("category", category);
      const res = await fetch(`/api/admin/academy/cases?${params}`);
      const data = await res.json();
      setCases(data.cases ?? []);
      setKnowHowLocked(Boolean(data.know_how_locked));
    } catch {
      setCases([]);
      setKnowHowLocked(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [tab, category]);

  const handleAction = async (caseId: string, action: "preview" | "publish" | "unpublish") => {
    // 非公開に戻すと全加盟店の一覧から消える。取り消しの効く操作ではあるが、
    // 他店が参照中の可能性があるので確認を挟む。
    if (action === "unpublish" && !confirm("この事例を非公開にします。全加盟店の一覧から見えなくなります。")) return;
    setPublishing(caseId);
    try {
      const res = await fetch("/api/admin/academy/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "publish"
            ? { case_id: caseId, action, preview_token: previewToken[caseId] }
            : { case_id: caseId, action },
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // 応答は { error: "validation_error", message: "…" }。error はコードなので、
        // 出すべきは message。コードを出すと「再生成してください」等の指示が消える。
        alert(json?.message ?? json?.error ?? "処理に失敗しました");
        return;
      }
      if (action === "preview") {
        // 生成した文面を出し、確認前の状態にする。押した人が中身を見るまで公開させない。
        setPreview((p) => ({ ...p, [caseId]: json?.data?.preview ?? json?.preview }));
        setPreviewToken((t) => ({ ...t, [caseId]: json?.data?.preview_token ?? json?.preview_token }));
        setConfirmed((c) => ({ ...c, [caseId]: false }));
        setExpanded(caseId);
        return;
      }
      // 公開／非公開の後は確認をやり直させる。サーバ側でも印は無効になるが
      // （updated_at を混ぜてある）、押せてしまうボタンを画面に残さない。
      setPreview((p) => {
        const { [caseId]: _drop, ...rest } = p;
        return rest;
      });
      setPreviewToken((t) => {
        const { [caseId]: _drop, ...rest } = t;
        return rest;
      });
      setConfirmed((c) => ({ ...c, [caseId]: false }));
      await fetchCases();
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ヘッダー + タブ（L字シェルのページバー） */}
      <a href="/admin/academy" className="text-sm text-accent hover:underline">
        ← Academy
      </a>
      <div className="mt-2 mb-4">
        <PageHeader
          tag="アカデミー"
          title="📚 施工事例ライブラリ"
          description="優良施工事例から学習。自テナントの候補事例をAcademyに登録できます。"
          actions={
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-sm bg-inset border border-border-subtle rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          }
          tabs={[
            { key: "published", label: "📖 公開事例" },
            { key: "candidates", label: "🌟 候補事例" },
          ]}
          activeTab={tab}
          onTabSelect={(k) => setTab(k as "published" | "candidates")}
        />
      </div>

      {/* 候補バナー */}
      {tab === "candidates" && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-xl text-xs text-accent">
          品質スコア80以上・写真4枚以上の証明書が自動的に候補として登録されます。
          「内容を確認」でAIが要約を生成します。**公開される文面をその場で確認**し、
          個人が特定できる記述が無いことをチェックしてから公開してください。
          公開後も「公開事例」タブから非公開に戻せます。
        </div>
      )}

      {/* ノウハウロックバナー (Free) */}
      {tab === "published" && knowHowLocked && (
        <div className="mb-4 p-3 bg-warning-dim border border-warning/30 rounded-xl text-xs text-warning flex items-start gap-2">
          <span className="mt-0.5">🔒</span>
          <div>
            <p className="font-medium">ノウハウ詳細はStarterプラン以上で閲覧できます</p>
            <p className="text-warning/70 mt-0.5">
              先輩加盟店が共有した知見を尊重するため、AI要約・良かった点・注意点はFreeプランでは表示されません。
            </p>
          </div>
        </div>
      )}

      {/* コンテンツ */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm">
            {tab === "candidates"
              ? "候補事例がありません。品質スコア80以上の証明書を発行すると自動登録されます。"
              : "公開事例はまだありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div key={c.id} className="glass-card hover:border-accent/40 transition-colors">
              {/* カードヘッダー */}
              <div
                className="p-4 cursor-pointer flex items-start justify-between gap-3"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-full">
                      {c.category}
                    </span>
                    {c.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-inset text-secondary border border-border-subtle rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="text-xs text-yellow-400">{DIFFICULTY_STARS(c.difficulty)}</span>
                  </div>
                  <p className="text-sm text-secondary line-clamp-2">
                    {tab === "published" && knowHowLocked ? (
                      <span className="text-muted italic">🔒 AI要約はStarterプラン以上で閲覧できます</span>
                    ) : (
                      (c.ai_summary ?? "AI要約なし")
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-bold px-2 py-1 rounded-lg ${scoreColor(c.quality_score)}`}>
                    {c.quality_score}
                  </span>
                  {/* 候補は「内容を確認」→ 目視確認 → 公開の2段階。いきなり公開させない。 */}
                  {tab === "candidates" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(c.id, "preview");
                      }}
                      disabled={publishing === c.id}
                      className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      {publishing === c.id ? "生成中..." : preview[c.id] ? "内容を再生成" : "内容を確認"}
                    </button>
                  )}
                  {/* 公開事例は全加盟店の一覧。非公開に戻せるのは自店の事例だけ
                      （API も所有テナントを見て弾くので、ここは押せないボタンを出さないため）。 */}
                  {tab === "published" && c.is_own && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(c.id, "unpublish");
                      }}
                      disabled={publishing === c.id}
                      className="text-xs px-3 py-1.5 bg-inset text-secondary border border-border-subtle rounded-lg hover:border-danger/40 hover:text-danger-text disabled:opacity-50 transition-colors"
                    >
                      {publishing === c.id ? "処理中..." : "非公開にする"}
                    </button>
                  )}
                  <span className="text-muted text-xs">{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* 展開コンテンツ */}
              {expanded === c.id && (
                <div className="px-4 pb-4 border-t border-border-subtle pt-4">
                  {tab === "published" && knowHowLocked ? (
                    <div className="rounded-xl bg-inset border border-border-subtle p-5 text-center">
                      <div className="text-2xl mb-2">🔒</div>
                      <p className="text-sm font-medium text-primary">ノウハウ詳細はStarterプラン以上で閲覧できます</p>
                      <p className="text-xs text-muted mt-1">
                        先輩加盟店が時間をかけて積み上げた知見です。閲覧にはアップグレードが必要です。
                      </p>
                      <a
                        href="/admin/billing"
                        className="inline-block mt-3 text-xs px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                      >
                        プランをアップグレード
                      </a>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {c.good_points.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-success mb-2">✅ 良かった点</h3>
                          <ul className="space-y-1">
                            {c.good_points.map((p, i) => (
                              <li key={i} className="text-xs text-secondary flex gap-1">
                                <span className="text-success shrink-0">•</span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {c.caution_points.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-warning mb-2">⚠️ 注意点</h3>
                          <ul className="space-y-1">
                            {c.caution_points.map((p, i) => (
                              <li key={i} className="text-xs text-secondary flex gap-1">
                                <span className="text-warning shrink-0">•</span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span>👁 {c.view_count}</span>
                    <span>👍 {c.helpful_count}</span>
                  </div>

                  {/* 公開前の目視確認。**実際に公開される文面そのもの**を出す。
                      要約の入力には証明書の自由記述が入るため、顧客名や車両番号が
                      混ざりうる。ここを見ずに公開できないようにしてある。 */}
                  {tab === "candidates" && preview[c.id] && (
                    <div className="mt-4 rounded-xl border border-warning/40 bg-warning-dim p-4">
                      <h3 className="text-xs font-semibold text-warning mb-2">
                        📢 全加盟店に公開される内容（これがそのまま共有されます）
                      </h3>
                      <dl className="space-y-2 text-xs">
                        <div>
                          <dt className="text-muted">要約</dt>
                          <dd className="text-primary">{preview[c.id].ai_summary}</dd>
                        </div>
                        {preview[c.id].good_points.length > 0 && (
                          <div>
                            <dt className="text-muted">良かった点</dt>
                            <dd className="text-primary">{preview[c.id].good_points.join(" / ")}</dd>
                          </div>
                        )}
                        {preview[c.id].caution_points.length > 0 && (
                          <div>
                            <dt className="text-muted">注意点</dt>
                            <dd className="text-primary">{preview[c.id].caution_points.join(" / ")}</dd>
                          </div>
                        )}
                        {preview[c.id].tags.length > 0 && (
                          <div>
                            <dt className="text-muted">タグ</dt>
                            <dd className="text-primary">{preview[c.id].tags.join("、")}</dd>
                          </div>
                        )}
                      </dl>

                      <label className="mt-3 flex items-start gap-2 text-xs text-primary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmed[c.id] ?? false}
                          onChange={(e) => setConfirmed((v) => ({ ...v, [c.id]: e.target.checked }))}
                          className="mt-0.5 shrink-0"
                        />
                        <span>
                          上の内容に<strong>顧客名・車両番号・個人や取引先が特定できる記述が含まれていない</strong>
                          ことを確認しました。
                        </span>
                      </label>

                      <button
                        onClick={() => handleAction(c.id, "publish")}
                        disabled={!confirmed[c.id] || !previewToken[c.id] || publishing === c.id}
                        className="mt-3 text-xs px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {publishing === c.id ? "処理中..." : "確認したので公開する"}
                      </button>
                      {!confirmed[c.id] && (
                        <p className="mt-2 text-[11px] text-muted">
                          確認にチェックを入れると公開できます。訂正が要るときは証明書側の記載を直してから「内容を再生成」を押してください。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
