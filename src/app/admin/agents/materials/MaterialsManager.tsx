"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const MATERIALS_BUCKET = "agent-materials";
const MAX_MATERIAL_SIZE = 100 * 1024 * 1024; // 100MB — keep in sync with the API

type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
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
  is_published: boolean;
  download_count: number;
  created_at: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function MaterialsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);

  // Upload form
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-materials", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setCategories(json.categories ?? []);
        setMaterials(json.materials ?? []);
        if (!categoryId && json.categories?.length) {
          setCategoryId(json.categories[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !title || !categoryId) {
      setMsg("ファイル、タイトル、カテゴリは必須です");
      return;
    }

    if (file.size > MAX_MATERIAL_SIZE) {
      setMsg(`ファイルサイズは ${Math.floor(MAX_MATERIAL_SIZE / (1024 * 1024))}MB 以下にしてください。`);
      return;
    }

    setUploading(true);
    setMsg(null);
    try {
      // Step 1: ask the server for a signed upload URL (tiny JSON request).
      const urlRes = await fetch("/api/admin/agent-materials/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_name: file.name, file_type: file.type, file_size: file.size }),
      });
      if (!urlRes.ok) {
        const j = await parseJsonSafe(urlRes);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${urlRes.status}`);
      }
      const { path, token, storage_path } = await urlRes.json();

      // Step 2: upload the file bytes DIRECTLY to Supabase Storage, bypassing
      // the hosting platform's request body limit (the cause of HTTP 413).
      const { error: uploadErr } = await supabase.storage
        .from(MATERIALS_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
      if (uploadErr) {
        throw new Error(uploadErr.message || "ストレージへのアップロードに失敗しました。");
      }

      // Step 3: create the DB record with metadata only.
      const res = await fetch("/api/admin/agent-materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category_id: categoryId,
          description,
          version,
          is_pinned: isPinned,
          storage_path,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }

      setMsg("アップロードしました");
      setTitle("");
      setDescription("");
      setVersion("");
      setIsPinned(false);
      if (fileRef.current) fileRef.current.value = "";
      setShowUpload(false);
      fetchData();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async (id: string, isPublished: boolean) => {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/admin/agent-materials/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_published: !isPublished }),
      });
      if (res.ok) fetchData();
    } catch {
      // ignore
    } finally {
      setActionBusy(null);
    }
  };

  const togglePin = async (id: string, isPinned: boolean) => {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/admin/agent-materials/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_pinned: !isPinned }),
      });
      if (res.ok) fetchData();
    } catch {
      // ignore
    } finally {
      setActionBusy(null);
    }
  };

  const handlePreview = async (id: string, fileType: string) => {
    if (!fileType.includes("pdf")) return;
    setPreviewBusy(id);
    try {
      const res = await fetch(`/api/admin/agent-materials/${id}/preview`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(
          json?.message ??
            json?.error ??
            "プレビューURLの取得に失敗しました。ファイルがストレージにアップロードされているか確認してください。",
        );
        return;
      }
      if (json.url) setPreviewUrl(json.url);
    } catch {
      setMsg("プレビューの取得中にエラーが発生しました。");
    } finally {
      setPreviewBusy(null);
    }
  };

  const handleDownload = async (id: string) => {
    setDownloadBusy(id);
    try {
      const res = await fetch(`/api/admin/agent-materials/${id}/download`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(
          json?.message ??
            json?.error ??
            "ダウンロードURLの取得に失敗しました。ファイルがストレージにアップロードされているか確認してください。",
        );
        return;
      }
      if (json.url) window.open(json.url, "_blank");
    } catch {
      setMsg("ダウンロードの取得中にエラーが発生しました。");
    } finally {
      setDownloadBusy(null);
    }
  };

  const seedDemoFiles = async () => {
    if (!confirm("デモ用プレースホルダーPDFをストレージに生成・アップロードします。よろしいですか？")) return;
    setSeedingDemo(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-materials/seed-demo-files", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok || res.status === 207) {
        const failed = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
        setMsg(
          failed.length === 0
            ? "デモファイルを生成しました。プレビュー・ダウンロードをお試しください。"
            : `${failed.length} 件の生成に失敗しました。`,
        );
        fetchData();
      } else {
        setMsg("デモファイルの生成に失敗しました。");
      }
    } catch {
      setMsg("デモファイルの生成中にエラーが発生しました。");
    } finally {
      setSeedingDemo(false);
    }
  };

  const deleteMaterial = async (id: string) => {
    if (!confirm("この資料を削除しますか？")) return;
    setActionBusy(id);
    try {
      const res = await fetch(`/api/admin/agent-materials/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMsg("削除しました");
        fetchData();
      }
    } catch {
      // ignore
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">{materials.length} 件の資料</span>
        <div className="flex gap-2">
          <button
            onClick={seedDemoFiles}
            disabled={seedingDemo}
            className="rounded-xl border border-border-default bg-surface px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-40"
            title="デモ用プレースホルダーPDFをストレージに生成"
          >
            {seedingDemo ? "生成中..." : "デモファイル生成"}
          </button>
          <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
            {showUpload ? "閉じる" : "新規アップロード"}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {/* Upload form */}
      {showUpload && (
        <div className="glass-card p-5 space-y-4">
          <div className="text-sm font-semibold text-primary">資料をアップロード</div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-secondary mb-1 block">タイトル *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field w-full"
                placeholder="例: Ledra加盟店向け提案書"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">カテゴリ *</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-field w-full">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-secondary mb-1 block">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field w-full"
              rows={2}
              placeholder="資料の概要（任意）"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-secondary mb-1 block">ファイル *</label>
              <input
                ref={fileRef}
                type="file"
                className="w-full text-sm text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent-blue-dim)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--accent-blue-text)]"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">バージョン</label>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input-field w-full"
                placeholder="例: v2.1"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded"
                />
                ピン留め（上部に固定表示）
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
            >
              キャンセル
            </button>
            <button onClick={handleUpload} disabled={uploading} className="btn-primary">
              {uploading ? "アップロード中..." : "アップロード"}
            </button>
          </div>
        </div>
      )}

      {/* Materials table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          資料がありません。「新規アップロード」から追加してください。
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">タイトル</th>
                  <th className="p-3 text-left font-semibold text-secondary">カテゴリ</th>
                  <th className="p-3 text-left font-semibold text-secondary">ファイル</th>
                  <th className="p-3 text-right font-semibold text-secondary">DL数</th>
                  <th className="p-3 text-left font-semibold text-secondary">状態</th>
                  <th className="p-3 text-left font-semibold text-secondary">登録日</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {m.is_pinned && (
                          <span className="text-warning" title="ピン留め">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                            </svg>
                          </span>
                        )}
                        <div>
                          <div className="font-medium text-primary">{m.title}</div>
                          {m.description && (
                            <div className="text-xs text-muted truncate max-w-[200px]">{m.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-secondary">{m.category_name}</td>
                    <td className="p-3">
                      <div className="text-xs font-mono text-muted">{m.file_name}</div>
                      <div className="text-xs text-muted">{formatFileSize(m.file_size)}</div>
                      {m.version && <Badge variant="default">{m.version}</Badge>}
                    </td>
                    <td className="p-3 text-right font-mono text-primary">{m.download_count}</td>
                    <td className="p-3">
                      {m.is_published ? (
                        <Badge variant="success">公開中</Badge>
                      ) : (
                        <Badge variant="default">非公開</Badge>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(m.created_at)}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {m.file_type.includes("pdf") && (
                          <button
                            onClick={() => handlePreview(m.id, m.file_type)}
                            disabled={previewBusy === m.id}
                            className="rounded-lg border border-border-default bg-surface px-2 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-40"
                            title="プレビュー"
                          >
                            {previewBusy === m.id ? (
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
                            ) : (
                              <svg
                                width="12"
                                height="12"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(m.id)}
                          disabled={downloadBusy === m.id}
                          className="rounded-lg border border-border-default bg-surface px-2 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-40"
                          title="ダウンロード"
                        >
                          {downloadBusy === m.id ? (
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
                          ) : (
                            <svg
                              width="12"
                              height="12"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                              />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => togglePin(m.id, m.is_pinned)}
                          disabled={actionBusy === m.id}
                          className="rounded-lg border border-border-default bg-surface px-2 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-40"
                          title={m.is_pinned ? "ピン解除" : "ピン留め"}
                        >
                          {m.is_pinned ? "★" : "☆"}
                        </button>
                        <button
                          onClick={() => togglePublish(m.id, m.is_published)}
                          disabled={actionBusy === m.id}
                          className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-40 ${
                            m.is_published
                              ? "border-warning/30 bg-warning-dim text-warning-text hover:bg-warning/15"
                              : "border-success/30 bg-success-dim text-success-text hover:bg-success/15"
                          }`}
                        >
                          {m.is_published ? "非公開" : "公開"}
                        </button>
                        <button
                          onClick={() => deleteMaterial(m.id)}
                          disabled={actionBusy === m.id}
                          className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PDF Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative flex h-[90vh] w-[90vw] max-w-5xl flex-col rounded-2xl bg-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
              <span className="text-sm font-semibold text-primary">プレビュー</span>
              <button
                onClick={() => setPreviewUrl(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-hover"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full border-0" title="PDF プレビュー" />
          </div>
        </div>
      )}
    </div>
  );
}
