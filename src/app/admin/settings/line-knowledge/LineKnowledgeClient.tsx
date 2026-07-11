"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export default function LineKnowledgeClient({
  role,
  apiBase = "/api/admin/settings/line-knowledge",
  showActivationHint = true,
}: {
  role: string;
  /** CRUD API のベースパス。運営の共有ナレッジ管理ページが差し替えて再利用する。 */
  apiBase?: string;
  /** 「自動返信を有効にするには」の案内カード (テナント設定のみ表示)。 */
  showActivationHint?: boolean;
}) {
  const API = apiBase;
  const canEdit = role === "owner" || role === "admin";
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 追加フォーム
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  // 編集中の行
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && Array.isArray(j?.entries)) {
        setEntries(j.entries as KnowledgeEntry[]);
        setWarning(typeof j?.warning === "string" ? j.warning : null);
      } else {
        // 空一覧と読込失敗を混同させない (「まだナレッジがありません」と誤表示しない)。
        setWarning("ナレッジの読み込みに失敗しました。再読み込みしてください。");
      }
    } catch {
      setWarning("ナレッジの読み込みに失敗しました。再読み込みしてください。");
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleAdd() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.entry) {
        setEntries((prev) => [...prev, j.entry as KnowledgeEntry]);
        setTitle("");
        setContent("");
        flash("ナレッジを追加しました。", true);
      } else {
        flash((j?.message as string) || "追加に失敗しました。", false);
      }
    } catch {
      flash("追加に失敗しました。", false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePatch(id: string, patch: Partial<Pick<KnowledgeEntry, "title" | "content" | "enabled">>) {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.entry) {
        setEntries((prev) => prev.map((e) => (e.id === id ? (j.entry as KnowledgeEntry) : e)));
        return true;
      }
      flash((j?.message as string) || "更新に失敗しました。", false);
      return false;
    } catch {
      flash("更新に失敗しました。", false);
      return false;
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("このナレッジを削除しますか？ AI はこの内容で回答しなくなります。")) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        flash("削除しました。", true);
      } else {
        const j = await parseJsonSafe(res);
        flash((j?.message as string) || "削除に失敗しました。", false);
      }
    } catch {
      flash("削除に失敗しました。", false);
    }
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editContent.trim()) return;
    const ok = await handlePatch(editingId, { title: editTitle.trim(), content: editContent.trim() });
    if (ok) {
      setEditingId(null);
      flash("更新しました。", true);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            msg.ok ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}
      {warning && <div className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">{warning}</div>}

      {showActivationHint && (
        <section className="glass-card p-5">
          <div className="text-base font-semibold text-primary">自動返信を有効にするには</div>
          <p className="mt-1 text-xs text-muted">
            ナレッジの登録に加えて、AI 自動入力設定で「受信メッセージに店舗ナレッジで自動返信」を ON
            にすると自動返信が始まります (既定 OFF)。ナレッジだけ登録して OFF のままにもできます。
            運営が提供する全店舗共通ナレッジも、同じ自動返信の回答ソースとして使われます
            (内容が重なる場合はこの店舗ナレッジが優先されます)。
          </p>
          <Link href="/admin/settings/ai-automation" className="btn-secondary mt-3 inline-block">
            ✨ AI 自動入力の設定を開く →
          </Link>
        </section>
      )}

      {canEdit && (
        <section className="glass-card p-5 space-y-3">
          <div className="text-base font-semibold text-primary">ナレッジを追加</div>
          <div>
            <label className="block text-xs text-muted mb-1">質問 / トピック (例: 営業時間を教えて)</label>
            <input
              className="input-field w-full"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="営業時間を教えて"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">回答 / 知識本文 (AI はこの内容のとおりに答えます)</label>
            <textarea
              className="input-field w-full"
              rows={4}
              value={content}
              maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              placeholder="平日 9:00〜18:00、日曜・祝日は定休です。"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !title.trim() || !content.trim()}
            onClick={handleAdd}
          >
            {saving ? "追加中…" : "追加する"}
          </button>
        </section>
      )}

      <section className="glass-card p-5">
        <div className="mb-3 text-base font-semibold text-primary">
          登録済みナレッジ {loading ? "" : `(${entries.length}件)`}
        </div>
        {loading ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">
            まだナレッジがありません。よくある質問とその回答を登録すると、LINE の AI
            自動返信が答えられるようになります。
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-subtle p-4">
                {editingId === e.id ? (
                  <div className="space-y-2">
                    <input
                      className="input-field w-full"
                      value={editTitle}
                      maxLength={200}
                      onChange={(ev) => setEditTitle(ev.target.value)}
                    />
                    <textarea
                      className="input-field w-full"
                      rows={4}
                      value={editContent}
                      maxLength={2000}
                      onChange={(ev) => setEditContent(ev.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary" onClick={saveEdit}>
                        保存
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${e.enabled ? "text-primary" : "text-muted"}`}>
                        {e.title}
                        {!e.enabled && <span className="ml-2 text-xs font-normal text-muted">(停止中)</span>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{e.content}</p>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={e.enabled}
                            onChange={() => void handlePatch(e.id, { enabled: !e.enabled })}
                          />
                          回答に使う
                        </label>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setEditingId(e.id);
                            setEditTitle(e.title);
                            setEditContent(e.content);
                          }}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="text-red-600 underline"
                          onClick={() => void handleDelete(e.id)}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
