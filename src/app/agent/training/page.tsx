"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import type { BadgeVariant } from "@/lib/statusMaps";

type Course = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content_type: string;
  content_url: string | null;
  thumbnail_url: string | null;
  duration_min: number | null;
  is_required: boolean;
  progress: {
    status: string;
    progress: number;
    completed_at: string | null;
  } | null;
};

type Stats = {
  total: number;
  completed: number;
  required: number;
  required_completed: number;
};

const CATEGORY_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  basic: { variant: "default", label: "基礎" },
  advanced: { variant: "violet", label: "応用" },
  product: { variant: "info", label: "商品知識" },
  sales: { variant: "success", label: "営業" },
  compliance: { variant: "warning", label: "コンプライアンス" },
};

const CONTENT_TYPE_ICONS: Record<string, string> = {
  video: "VID",
  document: "DOC",
  quiz: "QUIZ",
  mixed: "MIX",
};

export default function AgentTrainingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, required: 0, required_completed: 0 });
  const [activeCategory, setActiveCategory] = useState("all");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        window.location.href = "/agent/login";
        return;
      }
      setReady(true);
      fetchData();
    })();
  }, [supabase]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/agent/training");
    if (res.ok) {
      const json = await res.json();
      setCourses(json.courses ?? []);
      setStats(json.stats ?? { total: 0, completed: 0, required: 0, required_completed: 0 });
    }
    setLoading(false);
  };

  const markComplete = async (courseId: string) => {
    setUpdating(courseId);
    await fetch("/api/agent/training", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course_id: courseId, progress: 100 }),
    });
    fetchData();
    setUpdating(null);
  };

  const startCourse = async (course: Course) => {
    if (!course.content_url) {
      alert("このコンテンツはまだ準備中です。管理者にお問い合わせください。");
      return;
    }
    window.open(course.content_url, "_blank");
    if (!course.progress || course.progress.status === "not_started") {
      await fetch("/api/agent/training", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course_id: course.id, progress: 10 }),
      });
      fetchData();
    }
  };

  if (!ready) return null;

  const filtered = activeCategory === "all" ? courses : courses.filter((c) => c.category === activeCategory);

  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const requiredPct = stats.required > 0 ? Math.round((stats.required_completed / stats.required) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          TRAINING
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">研修・eラーニング</h1>
        <p className="mt-1 text-sm text-neutral-500">研修コンテンツの受講と進捗管理</p>
      </div>

      {/* Progress overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">全体進捗</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">{completionPct}%</div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
            <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">必修進捗</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">{requiredPct}%</div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
            <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${requiredPct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">完了</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">
            {stats.completed}/{stats.total}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">必修完了</div>
          <div className="mt-1 text-xl font-bold text-neutral-900">
            {stats.required_completed}/{stats.required}
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          すべて
        </button>
        {Object.entries(CATEGORY_MAP).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === key
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {val.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          研修コンテンツはまだありません
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => {
            const cat = CATEGORY_MAP[course.category] ?? CATEGORY_MAP.basic;
            const status = course.progress?.status ?? "not_started";
            const pct = course.progress?.progress ?? 0;
            const hasContent = !!course.content_url;

            return (
              <div
                key={course.id}
                className={`rounded-2xl border shadow-sm overflow-hidden ${hasContent ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-80"}`}
              >
                {/* Thumbnail */}
                <div
                  className={`h-32 flex items-center justify-center ${hasContent ? "bg-gradient-to-br from-neutral-100 to-neutral-200" : "bg-gradient-to-br from-neutral-100 to-neutral-150"}`}
                >
                  {hasContent ? (
                    <span className="text-2xl font-bold text-neutral-300">
                      {CONTENT_TYPE_ICONS[course.content_type] ?? "DOC"}
                    </span>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl">🔒</div>
                      <div className="mt-1 text-[11px] font-medium text-neutral-400">準備中</div>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={cat.variant}>{cat.label}</Badge>
                    {course.is_required && <Badge variant="danger">必修</Badge>}
                    {status === "completed" && <Badge variant="success">完了</Badge>}
                    {!hasContent && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        準備中
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-neutral-900">{course.title}</h3>
                  {course.description && (
                    <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{course.description}</p>
                  )}
                  {course.duration_min && (
                    <div className="mt-1 text-[11px] text-neutral-400">約 {course.duration_min}分</div>
                  )}

                  {/* Progress bar */}
                  {status !== "not_started" && hasContent && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>進捗</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-100">
                        <div
                          className={`h-1.5 rounded-full transition-all ${status === "completed" ? "bg-emerald-500" : "bg-blue-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {!hasContent ? (
                      <div className="flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-center text-xs font-medium text-neutral-400 cursor-not-allowed">
                        コンテンツ準備中
                      </div>
                    ) : status !== "completed" ? (
                      <>
                        <button
                          onClick={() => startCourse(course)}
                          className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
                        >
                          {status === "not_started" ? "受講開始" : "続きから"}
                        </button>
                        {status === "in_progress" && (
                          <button
                            onClick={() => markComplete(course.id)}
                            disabled={updating === course.id}
                            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            完了
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => startCourse(course)}
                        className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                      >
                        もう一度見る
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
