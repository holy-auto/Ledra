"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

export type MaintenanceLog = {
  id: string;
  performed_at: string;
  content: string;
  performer_email: string | null;
  created_at: string;
};

type Props = {
  publicId: string;
  logs: MaintenanceLog[];
  readOnly?: boolean;
};

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function CertMaintenanceLogs({ publicId, logs, readOnly }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formPerformedAt, setFormPerformedAt] = useState<string>(toDatetimeLocalValue(new Date().toISOString()));
  const [formContent, setFormContent] = useState<string>("");

  const resetForm = () => {
    setFormPerformedAt(toDatetimeLocalValue(new Date().toISOString()));
    setFormContent("");
    setError(null);
  };

  const handleCreate = () => {
    setError(null);
    if (!formPerformedAt) {
      setError("実施日時を入力してください。");
      return;
    }
    if (!formContent.trim()) {
      setError("メンテナンス内容を入力してください。");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/certificates/maintenance-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_id: publicId,
            performed_at: new Date(formPerformedAt).toISOString(),
            content: formContent.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "保存に失敗しました。");
          return;
        }
        setAdding(false);
        resetForm();
        router.refresh();
      } catch {
        setError("保存に失敗しました。");
      }
    });
  };

  const handleUpdate = (id: string) => {
    setError(null);
    if (!formPerformedAt) {
      setError("実施日時を入力してください。");
      return;
    }
    if (!formContent.trim()) {
      setError("メンテナンス内容を入力してください。");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/certificates/maintenance-logs/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            performed_at: new Date(formPerformedAt).toISOString(),
            content: formContent.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "更新に失敗しました。");
          return;
        }
        setEditingId(null);
        resetForm();
        router.refresh();
      } catch {
        setError("更新に失敗しました。");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("このメンテナンス記録を削除しますか？")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/certificates/maintenance-logs/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message ?? "削除に失敗しました。");
          return;
        }
        router.refresh();
      } catch {
        setError("削除に失敗しました。");
      }
    });
  };

  const startEdit = (log: MaintenanceLog) => {
    setEditingId(log.id);
    setFormPerformedAt(toDatetimeLocalValue(log.performed_at));
    setFormContent(log.content);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {!readOnly && !adding && editingId == null && (
        <button
          onClick={() => {
            setAdding(true);
            resetForm();
          }}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent/90"
        >
          メンテナンス記録を追加
        </button>
      )}

      {!readOnly && adding && (
        <div className="rounded-xl border border-border-default bg-base p-4 space-y-3">
          <div className="text-sm font-medium text-secondary">新しいメンテナンス記録</div>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">実施日時</span>
            <input
              type="datetime-local"
              value={formPerformedAt}
              onChange={(e) => setFormPerformedAt(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">メンテナンス内容</span>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              className={inputCls}
              rows={4}
              placeholder="実施したメンテナンスの詳細を入力してください。"
            />
          </label>
          {error && <div className="text-xs text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? "保存中…" : "保存"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                resetForm();
              }}
              disabled={isPending}
              className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="rounded-xl bg-base p-4 text-sm text-muted">メンテナンス記録はありません。</div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => {
            const isEditing = editingId === log.id;
            return (
              <li key={log.id} className="rounded-xl border border-border-default bg-base p-4 space-y-2">
                {!isEditing ? (
                  <>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="text-sm font-semibold text-primary">{formatDateTime(log.performed_at)}</div>
                      {log.performer_email && <div className="text-xs text-muted">{log.performer_email}</div>}
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-secondary">{log.content}</div>
                    {!readOnly && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => startEdit(log)}
                          className="text-xs text-accent hover:underline"
                          disabled={isPending}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="text-xs text-danger hover:underline"
                          disabled={isPending}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted">実施日時</span>
                      <input
                        type="datetime-local"
                        value={formPerformedAt}
                        onChange={(e) => setFormPerformedAt(e.target.value)}
                        className={inputCls}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted">メンテナンス内容</span>
                      <textarea
                        value={formContent}
                        onChange={(e) => setFormContent(e.target.value)}
                        className={inputCls}
                        rows={4}
                      />
                    </label>
                    {error && <div className="text-xs text-danger">{error}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(log.id)}
                        disabled={isPending}
                        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent/90 disabled:opacity-50"
                      >
                        {isPending ? "更新中…" : "更新"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          resetForm();
                        }}
                        disabled={isPending}
                        className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
