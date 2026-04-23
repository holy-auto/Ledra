"use client";

import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("category_id", categoryId);
      fd.append("description", description);
      fd.append("version", version);
      fd.append("is_pinned", isPinned ? "true" : "false");

      const res = await fetch("/api/admin/agent-materials", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
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
        <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
          {showUpload ? "閉じる" : "新規アップロード"}
        </button>
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
                      <div className="flex gap-1.5">
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
    </div>
  );
}
