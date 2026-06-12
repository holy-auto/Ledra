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

type TemplateField = {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
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
  has_template: boolean;
  template_fields: TemplateField[];
  created_at: string;
  updated_at: string;
};

type PersonalizeForm = {
  company_name: string;
  contact_name: string;
  proposal_date: string;
  memo: string;
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
  return "bg-surface-hover text-secondary";
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

  // Feature 1: in-browser PDF preview
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Feature 2: personalized cover sheet (表紙作成)
  const [personalizeMaterial, setPersonalizeMaterial] = useState<Material | null>(null);
  const [personalizeData, setPersonalizeData] = useState<PersonalizeForm>({
    company_name: "",
    contact_name: "",
    proposal_date: "",
    memo: "",
  });
  const [generating, setGenerating] = useState(false);
  const [personalizeError, setPersonalizeError] = useState<string | null>(null);

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

  const handlePreview = async (material: Material) => {
    setPreviewing(material.id);
    try {
      const res = await fetch(`/api/agent/materials/${material.id}/preview`);
      if (!res.ok) throw new Error("preview_failed");
      const json = await res.json();
      if (json.url) {
        setPreviewMaterial(material);
        setPreviewUrl(json.url as string);
      }
    } catch {
      // ignore
    } finally {
      setPreviewing(null);
    }
  };

  const closePreview = () => {
    setPreviewMaterial(null);
    setPreviewUrl(null);
  };

  const openPersonalize = (material: Material) => {
    setPersonalizeMaterial(material);
    setPersonalizeData({ company_name: "", contact_name: "", proposal_date: "", memo: "" });
    setPersonalizeError(null);
  };

  const closePersonalize = () => {
    setPersonalizeMaterial(null);
    setPersonalizeError(null);
  };

  const handleGenerateCover = async () => {
    if (!personalizeMaterial) return;
    setGenerating(true);
    setPersonalizeError(null);
    try {
      const res = await fetch(`/api/agent/materials/${personalizeMaterial.id}/personalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: personalizeData.company_name,
          contact_name: personalizeData.contact_name,
          proposal_date: personalizeData.proposal_date || undefined,
          memo: personalizeData.memo || undefined,
        }),
      });
      if (!res.ok) {
        let message = "表紙PDFの生成に失敗しました。";
        try {
          const json = await res.json();
          if (typeof json?.message === "string") message = json.message;
        } catch {
          // non-JSON error body — keep default message
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cover_${personalizeMaterial.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      closePersonalize();
    } catch (e) {
      setPersonalizeError(e instanceof Error ? e.message : "表紙PDFの生成に失敗しました。");
    } finally {
      setGenerating(false);
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
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary">
          MATERIALS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-primary">営業資料</h1>
        <p className="mt-1 text-sm text-muted">
          本部から共有されたパンフレット・契約書・マニュアル等の資料をダウンロードできます。
        </p>
      </div>

      {/* Operation Guide banner — built-in onboarding doc */}
      <a
        href="/agent/operation-guide"
        className="block rounded-2xl border border-accent/30 bg-accent-dim/20 p-5 hover:border-accent/50 hover:bg-accent-dim/30 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white text-2xl">
            📘
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold tracking-[0.18em] text-accent">BUILT-IN GUIDE</span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">NEW</span>
            </div>
            <div className="mt-1 text-base font-semibold text-primary">Ledra 操作ガイド</div>
            <p className="mt-1 text-sm text-secondary leading-relaxed">
              施工店様向けの公式操作ガイド。商談時の説明資料・導入後フォローにご利用ください。 公開URL{" "}
              <code className="rounded bg-surface-hover px-1 py-0.5 text-[11px]">/guide</code>{" "}
              をそのまま施工店様に共有することもできます。
            </p>
          </div>
          <span aria-hidden className="shrink-0 text-muted text-lg">
            →
          </span>
        </div>
      </a>

      {/* Search + Category filters */}
      <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm space-y-3">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="資料名・ファイル名で検索..."
          className="w-full rounded-xl border border-border-default bg-inset px-4 py-2.5 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-primary text-inverse"
                : "bg-surface-hover text-secondary hover:bg-surface-active"
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
                    ? "bg-primary text-inverse"
                    : "bg-surface-hover text-secondary hover:bg-surface-active"
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
            <div key={i} className="h-20 rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface p-12 text-center shadow-sm">
          <div className="text-4xl mb-3 text-muted">
            <svg
              width="48"
              height="48"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              className="mx-auto"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
          </div>
          <div className="text-sm font-medium text-secondary">資料がありません</div>
          <p className="mt-1 text-xs text-muted">
            {searchQuery
              ? `「${searchQuery}」に一致する資料が見つかりません。`
              : "本部が資料をアップロードするまでお待ちください。"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pinned materials */}
          {pinned.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">PINNED</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {pinned.map((m) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    onDownload={handleDownload}
                    downloading={downloading === m.id}
                    onPreview={handlePreview}
                    previewing={previewing === m.id}
                    onPersonalize={openPersonalize}
                    pinned
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular materials */}
          <div className="space-y-2">
            {pinned.length > 0 && <div className="text-xs font-semibold tracking-[0.18em] text-muted">ALL FILES</div>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regular.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  onDownload={handleDownload}
                  downloading={downloading === m.id}
                  onPreview={handlePreview}
                  previewing={previewing === m.id}
                  onPersonalize={openPersonalize}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats footer */}
      {!loading && filtered.length > 0 && (
        <div className="text-center text-xs text-muted">
          {filtered.length} 件の資料
          {activeCategory !== "all" && ` — ${categories.find((c) => c.id === activeCategory)?.name ?? ""}`}
        </div>
      )}

      {/* Preview modal (Feature 1) */}
      {previewMaterial && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
          onClick={closePreview}
          role="presentation"
        >
          <div
            className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${previewMaterial.title} プレビュー`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-primary">{previewMaterial.title}</div>
                <div className="truncate text-[11px] text-muted">{previewMaterial.file_name}</div>
              </div>
              <button
                onClick={closePreview}
                aria-label="閉じる"
                className="shrink-0 rounded-lg border border-border-default bg-surface p-1.5 text-secondary hover:bg-surface-hover"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe src={previewUrl} title={previewMaterial.title} className="w-full h-full flex-1 bg-inset" />
          </div>
        </div>
      )}

      {/* Personalize / cover-sheet modal (Feature 2) */}
      {personalizeMaterial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePersonalize}
          role="presentation"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="表紙作成"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-default px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-[0.18em] text-accent">COVER SHEET</div>
                <h2 className="mt-1 text-base font-semibold text-primary">提案表紙を作成</h2>
                <p className="mt-0.5 truncate text-xs text-muted">{personalizeMaterial.title}</p>
              </div>
              <button
                onClick={closePersonalize}
                aria-label="閉じる"
                className="shrink-0 rounded-lg border border-border-default bg-surface p-1.5 text-secondary hover:bg-surface-hover"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {personalizeError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {personalizeError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">
                  会社名 <span className="text-red-500">*</span>
                </label>
                <input
                  value={personalizeData.company_name}
                  onChange={(e) => setPersonalizeData((d) => ({ ...d, company_name: e.target.value }))}
                  placeholder="株式会社○○"
                  className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">
                  担当者名 <span className="text-red-500">*</span>
                </label>
                <input
                  value={personalizeData.contact_name}
                  onChange={(e) => setPersonalizeData((d) => ({ ...d, contact_name: e.target.value }))}
                  placeholder="山田 太郎"
                  className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">提案日</label>
                <input
                  type="date"
                  value={personalizeData.proposal_date}
                  onChange={(e) => setPersonalizeData((d) => ({ ...d, proposal_date: e.target.value }))}
                  className="w-full rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">メモ・一言添え</label>
                <textarea
                  value={personalizeData.memo}
                  onChange={(e) => setPersonalizeData((d) => ({ ...d, memo: e.target.value }))}
                  rows={3}
                  placeholder="ご提案内容や一言メッセージを記入できます。"
                  className="w-full resize-none rounded-xl border border-border-default bg-inset px-3 py-2 text-sm focus:bg-surface focus:outline-none focus:ring-2 focus:ring-border-strong"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-4">
              <button
                onClick={closePersonalize}
                disabled={generating}
                className="rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                onClick={handleGenerateCover}
                disabled={generating || !personalizeData.company_name.trim() || !personalizeData.contact_name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverse hover:opacity-90 disabled:opacity-40"
              >
                {generating ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    生成中
                  </span>
                ) : (
                  "表紙PDFを生成"
                )}
              </button>
            </div>
          </div>
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
  onPreview,
  previewing,
  onPersonalize,
  pinned,
}: {
  material: Material;
  onDownload: (m: Material) => void;
  downloading: boolean;
  onPreview: (m: Material) => void;
  previewing: boolean;
  onPersonalize: (m: Material) => void;
  pinned?: boolean;
}) {
  const icon = getFileIcon(material.file_type);
  const iconColor = getFileColor(material.file_type);
  const canPreview = material.file_type.includes("pdf");

  return (
    <div
      className={`group rounded-2xl border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${
        pinned ? "border-amber-200 bg-amber-50/30" : "border-border-default"
      }`}
    >
      <div className="flex gap-3">
        {/* File type icon */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${iconColor}`}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-primary">
                {pinned && (
                  <span className="mr-1 text-amber-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="inline -mt-0.5">
                      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                    </svg>
                  </span>
                )}
                {material.title}
              </h3>
              {material.description && <p className="mt-0.5 truncate text-xs text-muted">{material.description}</p>}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>{formatFileSize(material.file_size)}</span>
            <span className="text-muted">|</span>
            <span>{material.file_name}</span>
            {material.version && (
              <>
                <span className="text-muted">|</span>
                <Badge variant="default">{material.version}</Badge>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="font-medium text-muted">{material.category_name}</span>
            <span className="text-muted">|</span>
            <span>{formatDateTime(material.created_at)}</span>
            {material.download_count > 0 && (
              <>
                <span className="text-muted">|</span>
                <span>{material.download_count} DL</span>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {canPreview && (
              <button
                onClick={() => onPreview(material)}
                disabled={previewing}
                className="rounded-lg border border-border-default bg-surface px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-hover disabled:opacity-40"
              >
                {previewing ? (
                  <span className="flex items-center gap-1">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    読込中
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    プレビュー
                  </span>
                )}
              </button>
            )}

            {material.has_template && (
              <button
                onClick={() => onPersonalize(material)}
                className="rounded-lg border border-accent/40 bg-accent-dim/20 px-3 py-1 text-xs font-medium text-accent hover:bg-accent-dim/30"
              >
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                    />
                  </svg>
                  表紙作成
                </span>
              </button>
            )}

            <button
              onClick={() => onDownload(material)}
              disabled={downloading}
              className="rounded-lg border border-border-default bg-surface px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-hover disabled:opacity-40"
            >
              {downloading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  取得中
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
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
