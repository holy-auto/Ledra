"use client";

import { useEffect, useState, useRef } from "react";
import Badge from "@/components/ui/Badge";
import { getStatusEntry, SHARED_FILE_DIRECTION_MAP } from "@/lib/statusMaps";
import { formatDateTime } from "@/lib/format";

type SharedFile = {
  id: string;
  agent_id: string;
  uploaded_by: string;
  direction: string;
  file_name: string;
  file_size: number;
  file_type: string;
  note: string | null;
  created_at: string;
};

type DirectionFilter = "all" | "to_agent" | "to_hq";

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
  if (fileType.includes("image")) return "IMG";
  return "FILE";
}

function getFileColor(fileType: string): string {
  if (fileType.includes("pdf")) return "bg-red-100 text-red-700";
  if (fileType.includes("word") || fileType.includes("document")) return "bg-blue-100 text-blue-700";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "bg-emerald-100 text-emerald-700";
  if (fileType.includes("image")) return "bg-violet-100 text-violet-700";
  return "bg-surface-hover text-secondary";
}

export default function AgentSharedFilesPage() {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const params = filter !== "all" ? `?direction=${filter}` : "";
      const res = await fetch(`/api/agent/shared-files${params}`);
      const data = await res.json();
      if (res.ok) setFiles(data.files ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchFiles();
  }, [filter]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    if (note.trim()) fd.append("note", note.trim());

    try {
      const res = await fetch("/api/agent/shared-files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "アップロードに失敗しました");
        return;
      }
      setNote("");
      fetchFiles();
    } catch {
      setError("アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const res = await fetch(`/api/agent/shared-files/${fileId}/download`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      // ignore
    }
  };

  const TABS: { key: DirectionFilter; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "to_agent", label: "本部から" },
    { key: "to_hq", label: "本部へ" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">共有ファイル</h1>
        <p className="text-sm text-muted mt-1">本部との間でファイルを共有・やり取りできます。</p>
      </div>

      {/* Upload Section */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="section-tag">ファイルを送信</h2>
        <div className="grid gap-3">
          <label>
            <div className="text-sm text-secondary mb-1">メモ（任意）</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input-field w-full"
              placeholder="ファイルの説明やメモ"
            />
          </label>
          <label className="block">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              className="border-2 border-dashed border-default rounded-xl p-6 text-center cursor-pointer hover:border-accent transition-colors"
            >
              {uploading ? (
                <p className="text-sm text-muted">アップロード中...</p>
              ) : (
                <>
                  <svg
                    className="w-8 h-8 text-muted mx-auto mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                    />
                  </svg>
                  <p className="text-sm text-muted">クリックしてファイルを選択（PDF・画像・Word・Excel、10MB以下）</p>
                </>
              )}
            </div>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key ? "bg-accent text-white" : "bg-inset text-secondary hover:bg-surface-active"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* File List */}
      {loading ? (
        <div className="glass-card p-8 text-center text-muted">読み込み中...</div>
      ) : files.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">ファイルはまだありません。</div>
      ) : (
        <div className="glass-card divide-y divide-default">
          {files.map((f) => {
            const dirEntry = getStatusEntry(SHARED_FILE_DIRECTION_MAP, f.direction);
            return (
              <div key={f.id} className="flex items-center gap-4 px-6 py-4">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${getFileColor(f.file_type)}`}
                >
                  {getFileIcon(f.file_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary truncate">{f.file_name}</p>
                    <Badge variant={dirEntry.variant}>{dirEntry.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                    <span>{formatFileSize(f.file_size)}</span>
                    <span>{formatDateTime(f.created_at)}</span>
                    {f.note && <span className="truncate max-w-[200px]">{f.note}</span>}
                  </div>
                </div>
                <button onClick={() => handleDownload(f.id)} className="btn-secondary text-xs shrink-0">
                  ダウンロード
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
