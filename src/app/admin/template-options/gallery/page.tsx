"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import type { PlatformTemplateRow, TemplateConfig } from "@/types/templateOption";

const CATEGORY_LABELS: Record<string, string> = {
  coating: "コーティング",
  detailing: "ディテーリング",
  maintenance: "メンテナンス",
  general: "汎用",
};

export default function GalleryPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<PlatformTemplateRow[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/template-options/gallery");
        const j = await res.json();
        setTemplates(j.templates ?? []);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "all"
    ? templates
    : templates.filter((t) => t.category === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="テンプレートオプション"
        title="テンプレートギャラリー"
        actions={
          <Link className="btn-ghost text-sm" href="/admin/template-options">
            戻る
          </Link>
        }
      />

      {/* カテゴリフィルタ */}
      <div className="flex gap-2">
        {["all", "coating", "detailing", "maintenance", "general"].map((cat) => (
          <button
            key={cat}
            type="button"
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              filter === cat
                ? "bg-accent text-inverse"
                : "bg-surface-hover text-muted hover:text-primary"
            }`}
            onClick={() => setFilter(cat)}
          >
            {cat === "all" ? "すべて" : CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-muted">読み込み中...</div>}

      {/* テンプレート一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((tpl) => {
          const config = tpl.base_config as TemplateConfig;
          const borderStyle = config.style?.border_style ?? "simple";
          const bgVariant = config.style?.background_variant ?? "white";

          return (
            <div key={tpl.id} className="glass-card overflow-hidden">
              {/* サムネイルプレビュー（証明書風） */}
              <div
                className="h-52 p-4 flex flex-col items-center justify-between"
                style={{
                  backgroundColor: bgVariant === "cream" ? "#faf8f5" : bgVariant === "light-gray" ? "#f5f5f7" : "#fff",
                  border: `${borderStyle === "double" ? "4px double" : borderStyle === "elegant" ? "2px solid" : borderStyle === "none" ? "none" : "1px solid"} ${config.branding?.primary_color ?? "#1a1a2e"}40`,
                  color: config.branding?.primary_color ?? "#1a1a2e",
                  fontFamily: config.style?.font_family === "noto-serif-jp" ? "serif" : "sans-serif",
                }}
              >
                <div className="text-[10px] opacity-40 tracking-widest">CERTIFICATE</div>
                <div className="text-center space-y-1">
                  <div className="text-lg font-bold tracking-wider">施工証明書</div>
                  <div className="text-[9px] opacity-50">Certificate of Service</div>
                </div>
                <div className="w-full space-y-1">
                  <div className="h-1 rounded-full opacity-10" style={{ backgroundColor: config.branding?.primary_color ?? "#1a1a2e" }} />
                  <div className="flex justify-between text-[8px] opacity-30">
                    <span>車両情報</span>
                    <span>施工日: 20XX/XX/XX</span>
                  </div>
                  <div className="h-0.5 w-3/4 rounded-full opacity-5" style={{ backgroundColor: config.branding?.primary_color ?? "#1a1a2e" }} />
                  <div className="h-0.5 w-1/2 rounded-full opacity-5" style={{ backgroundColor: config.branding?.primary_color ?? "#1a1a2e" }} />
                </div>
              </div>

              <div className="p-4 space-y-2">
                <div className="text-sm font-semibold text-primary">{tpl.name}</div>
                <div className="text-xs text-muted">{tpl.description}</div>
                <div className="text-xs text-muted">
                  カテゴリ: {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                </div>

                {/* 配色プレビュー */}
                <div className="flex gap-2 pt-1">
                  <div className="text-xs text-muted">スタイル:</div>
                  <div className="text-xs text-muted">
                    {config.style?.font_family === "noto-serif-jp" ? "明朝体" : "ゴシック体"} /
                    {borderStyle === "none" ? "枠なし" : borderStyle === "double" ? "二重線" : borderStyle === "elegant" ? "エレガント" : "シンプル"}
                  </div>
                </div>

                <Link
                  href={`/admin/template-options/configure?platform_template_id=${tpl.id}`}
                  className="btn-primary text-xs w-full text-center mt-3 block"
                >
                  このテンプレートを使う
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-muted text-center py-8">テンプレートがありません</div>
      )}
    </div>
  );
}
