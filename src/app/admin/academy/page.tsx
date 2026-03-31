import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AcademyPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  if (!mem) return <div className="text-sm text-muted">テナント情報が見つかりません</div>;

  const admin = getSupabaseAdmin();

  // 品質スコア統計
  const { data: scoreStats } = await admin
    .from("certificate_quality_scores")
    .select("score, standard_level")
    .eq("tenant_id", mem.tenant_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const avgScore = scoreStats?.length
    ? Math.round(scoreStats.reduce((s, r) => s + r.score, 0) / scoreStats.length)
    : 0;

  const levelCounts = scoreStats?.reduce(
    (acc, r) => {
      const lvl = r.standard_level ?? "none";
      acc[lvl] = (acc[lvl] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) ?? {};

  // 候補事例数
  const { count: candidateCount } = await admin
    .from("academy_cases")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", mem.tenant_id)
    .eq("is_candidate", true)
    .eq("is_published", false);

  // 公開事例数
  const { count: publishedCount } = await admin
    .from("academy_cases")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true);

  // プラン確認
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("plan_tier, name")
    .eq("id", mem.tenant_id)
    .single();
  const planTier = normalizePlanTier(tenantRow?.plan_tier);
  const isAiEnabled = planTier === "standard" || planTier === "pro";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🎓</span>
          <h1 className="text-2xl font-bold text-gray-900">Ledra Academy</h1>
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            {planTier.toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          AIが施工記録の品質を分析し、現場ノウハウを業界の知識資産に変えます
        </p>
      </div>

      {!isAiEnabled && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">AI機能はStandard/Proプランで利用できます</p>
            <p className="text-xs text-amber-600 mt-1">
              基本品質チェックは現在のプランでもご利用いただけます
            </p>
          </div>
        </div>
      )}

      {/* 品質スコアサマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{avgScore}</div>
          <div className="text-xs text-gray-500 mt-1">平均品質スコア</div>
          <div className="text-xs text-gray-400">(直近30件)</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-yellow-500">{levelCounts["pro"] ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Pro 認定件数</div>
          <div className="text-xs text-yellow-500">スコア90+</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{candidateCount ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">公開候補事例</div>
          <div className="text-xs text-gray-400">未公開</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">{publishedCount ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">公開済み事例</div>
          <div className="text-xs text-gray-400">全加盟店共有</div>
        </div>
      </div>

      {/* メニュー */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* QAアシスタント */}
        <Link
          href="/admin/academy/qa"
          className={`group bg-white rounded-xl border p-5 hover:shadow-md transition-all ${!isAiEnabled ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">💬</span>
            <div>
              <div className="font-semibold text-gray-800 group-hover:text-blue-600">
                QAアシスタント
              </div>
              <div className="text-xs text-gray-400">Standard以上</div>
            </div>
            {!isAiEnabled && <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">ロック</span>}
          </div>
          <p className="text-sm text-gray-500">
            施工に関する質問をAIに聞けます。Academy事例・マニュアルを参照して回答します。
          </p>
        </Link>

        {/* AI添削 */}
        <Link
          href="/admin/academy/feedback"
          className={`group bg-white rounded-xl border p-5 hover:shadow-md transition-all ${!isAiEnabled ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✏️</span>
            <div>
              <div className="font-semibold text-gray-800 group-hover:text-blue-600">
                証明書AI添削
              </div>
              <div className="text-xs text-gray-400">Standard以上</div>
            </div>
            {!isAiEnabled && <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">ロック</span>}
          </div>
          <p className="text-sm text-gray-500">
            証明書の品質をAIが採点・フィードバック。Ledra Standard達成状況も確認できます。
          </p>
        </Link>

        {/* 施工事例 */}
        <Link
          href="/admin/academy/cases"
          className="group bg-white rounded-xl border p-5 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">📚</span>
            <div>
              <div className="font-semibold text-gray-800 group-hover:text-blue-600">
                施工事例ライブラリ
              </div>
              <div className="text-xs text-gray-400">全プラン</div>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            優良施工事例を閲覧・学習。自テナントの候補事例を公開登録できます。
          </p>
        </Link>

        {/* Ledra Standard 達成状況 */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🏆</span>
            <div>
              <div className="font-semibold text-gray-800">Ledra Standard 達成状況</div>
              <div className="text-xs text-gray-400">品質基準</div>
            </div>
          </div>
          <div className="space-y-2">
            {(["basic", "standard", "pro"] as const).map((lvl) => {
              const count = levelCounts[lvl] ?? 0;
              const total = scoreStats?.length ?? 1;
              const pct = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                basic: "bg-green-500", standard: "bg-blue-500", pro: "bg-yellow-400"
              };
              return (
                <div key={lvl} className="flex items-center gap-2">
                  <span className="text-xs w-16 text-gray-500 capitalize">{lvl}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${colors[lvl]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8">{count}件</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 学習パス */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-6">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>📋</span> 学習パス
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { level: "Lv.1 入門", desc: "証明書の書き方・必須写真・材料記載", done: true },
            { level: "Lv.2 中級", desc: "カテゴリ別記録・保険査定・クレーム防止", done: isAiEnabled },
            { level: "Lv.3 上級", desc: "Ledra Standard認定・事例貢献", done: false },
          ].map((item, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 border ${item.done ? "bg-white border-blue-200" : "bg-gray-50 border-gray-200 opacity-60"}`}
            >
              <div className="font-medium text-sm text-gray-700 mb-1">{item.level}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
              {item.done && (
                <div className="mt-2 text-xs text-green-600 font-medium">✓ 受講可能</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
