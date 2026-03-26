"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type Material = {
  id: string;
  category_id: string;
  category_name: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number;
  file_type: string;
  version: string | null;
  is_pinned: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(fileType: string): string {
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("word") || fileType.includes("document")) return "DOC";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "XLS";
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "PPT";
  if (fileType.includes("image")) return "IMG";
  if (fileType.includes("video")) return "VID";
  if (fileType.includes("zip") || fileType.includes("archive")) return "ZIP";
  return "FILE";
}

function getFileColor(fileType: string): string {
  if (fileType.includes("pdf")) return "bg-red-100 text-red-700";
  if (fileType.includes("word") || fileType.includes("document")) return "bg-blue-100 text-blue-700";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "bg-emerald-100 text-emerald-700";
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "bg-amber-100 text-amber-700";
  if (fileType.includes("image")) return "bg-violet-100 text-violet-700";
  if (fileType.includes("video")) return "bg-pink-100 text-pink-700";
  return "bg-neutral-100 text-neutral-700";
}

export default function AgentMaterialsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/agent/login";
        return;
      }
      setReady(true);
      fetchData();
    })();
  }, [supabase]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/materials");
      if (!res.ok) throw new Error("資料の取得に失敗しました");
        const json = await res.json();
        setCategories(json.categories ?? []);
        setMaterials(json.materials ?? []);
    } catch (e: any) {
      setError(e?.message ?? "資料の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (material: Material) => {
    setDownloading(material.id);
    try {
      const res = await fetch(`/api/agent/materials/${material.id}/download`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("download_failed");
      const json = await res.json();
      if (json.url) {
        window.open(json.url, "_blank");
      }
    } catch {
      // ignore
    } finally {
      setDownloading(null);
    }
  };

  if (!ready) return null;

  const filtered = materials.filter((m) => {
    const matchesCategory = activeCategory === "all" || m.category_id === activeCategory;
    const matchesSearch =
      !searchQuery ||
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const pinned = filtered.filter((m) => m.is_pinned);
  const regular = filtered.filter((m) => !m.is_pinned);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          MATERIALS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
          営業資料
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          本部から共有されたパンフレット・契約書・マニュアル等の資料をダウンロードできます。
        </p>
      </div>

      {/* Search + Category filters */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="資料名・ファイル名で検索..."
          className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
        />
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
            <span className="ml-1 opacity-60">{materials.length}</span>
          </button>
          {categories.map((cat) => {
            const count = materials.filter((m) => m.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {cat.name}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
          <div className="text-4xl mb-3 text-neutral-300">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} className="mx-auto">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-neutral-600">資料がありません</div>
          <p className="mt-1 text-xs text-neutral-400">
            {searchQuery ? `「${searchQuery}」に一致する資料が見つかりません。` : "本部が資料をアップロードするまでお待ちください。"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pinned materials */}
          {pinned.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                PINNED
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {pinned.map((m) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    onDownload={handleDownload}
                    downloading={downloading === m.id}
                    pinned
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular materials */}
          <div className="space-y-2">
            {pinned.length > 0 && (
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                ALL FILES
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regular.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  onDownload={handleDownload}
                  downloading={downloading === m.id}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats footer */}
      {!loading && filtered.length > 0 && (
        <div className="text-center text-xs text-neutral-400">
          {filtered.length} 件の資料
          {activeCategory !== "all" && ` — ${categories.find((c) => c.id === activeCategory)?.name ?? ""}`}
        </div>
      )}
    </div>
  );
}

/* ── Material Card Component ── */

function MaterialCard({
  material,
  onDownload,
  downloading,
  pinned,
}: {
  material: Material;
  onDownload: (m: Material) => void;
  downloading: boolean;
  pinned?: boolean;
}) {
  const icon = getFileIcon(material.file_type);
  const iconColor = getFileColor(material.file_type);

  return (
    <div
      className={`group rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        pinned ? "border-amber-200 bg-amber-50/30" : "border-neutral-200"
      }`}
    >
      <div className="flex gap-3">
        {/* File type icon */}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${iconColor}`}>
          {icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-neutral-900">
                {pinned && (
                  <span className="mr-1 text-amber-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="inline -mt-0.5">
                      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                    </svg>
                  </span>
                )}
                {material.title}
              </h3>
              {material.description && (
                <p className="mt-0.5 truncate text-xs text-neutral-500">{material.description}</p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
            <span>{formatFileSize(material.file_size)}</span>
            <span className="text-neutral-200">|</span>
            <span>{material.file_name}</span>
            {material.version && (
              <>
                <span className="text-neutral-200">|</span>
                <Badge variant="default">{material.version}</Badge>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-neutral-400">
              <span className="font-medium text-neutral-500">{material.category_name}</span>
              <span className="text-neutral-200">|</span>
              <span>{formatDateTime(material.created_at)}</span>
              {material.download_count > 0 && (
                <>
                  <span className="text-neutral-200">|</span>
                  <span>{material.download_count} DL</span>
                </>
              )}
            </div>

            <button
              onClick={() => onDownload(material)}
              disabled={downloading}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              {downloading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  取得中
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  ダウンロード
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
