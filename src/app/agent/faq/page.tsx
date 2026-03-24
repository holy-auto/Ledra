"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string; slug: string };
type FaqItem = {
  id: string;
  category_id: string;
  category_name: string;
  question: string;
  answer: string;
};

export default function AgentFaqPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      const res = await fetch("/api/agent/faq");
      if (res.ok) {
        const json = await res.json();
        setCategories(json.categories ?? []);
        setFaqs(json.faqs ?? []);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!ready) return null;

  const q = searchQuery.toLowerCase();
  const filtered = faqs.filter((f) => {
    const matchesCat = activeCategory === "all" || f.category_id === activeCategory;
    const matchesSearch = !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          FAQ
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">よくある質問</h1>
        <p className="mt-1 text-sm text-neutral-500">サービスや営業に関するよくある質問と回答</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="質問を検索..."
          className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === "all" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                activeCategory === cat.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {searchQuery ? `「${searchQuery}」に一致するFAQが見つかりません` : "FAQはまだ登録されていません"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((faq) => (
            <div key={faq.id} className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => toggle(faq.id)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">Q</span>
                  <span className="text-sm font-medium text-neutral-900">{faq.question}</span>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  className={`shrink-0 text-neutral-400 transition-transform ${expanded.has(faq.id) ? "rotate-180" : ""}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {expanded.has(faq.id) && (
                <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-4">
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">A</span>
                    <div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-wrap">{faq.answer}</div>
                  </div>
                  <div className="mt-2 text-right text-[11px] text-neutral-400">{faq.category_name}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
