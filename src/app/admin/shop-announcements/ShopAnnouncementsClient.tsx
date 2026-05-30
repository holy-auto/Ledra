"use client";

import { useEffect, useState } from "react";

interface Announcement {
  id: string;
  title: string;
  body: string;
  published: boolean;
  published_at: string | null;
  translations: Record<string, { title?: string; body?: string }> | null;
  translated_at: string | null;
  created_at: string;
  updated_at: string;
}

const LANG_LABEL: Record<string, string> = { en: "EN", zh: "中", vi: "Vi" };

export default function ShopAnnouncementsClient({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shop-announcements");
      const j = await res.json().catch(() => null);
      setItems(j?.announcements ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!title.trim() || !body.trim()) {
      setMsg({ ok: false, text: "タイトルと本文は必須です。" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/shop-announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, published: publishNow }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: j?.message ?? "作成に失敗しました。" });
        return;
      }
      setTitle("");
      setBody("");
      setPublishNow(false);
      setMsg({ ok: true, text: "作成しました。自動翻訳が有効なら数秒後に翻訳が付きます。" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(a: Announcement) {
    await fetch("/api/admin/shop-announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, published: !a.published }),
    });
    await load();
  }

  async function remove(a: Announcement) {
    if (!confirm("このお知らせを削除しますか？")) return;
    await fetch("/api/admin/shop-announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <section className="glass-card space-y-3 p-5">
          <div className="text-base font-semibold text-primary">新しいお知らせ</div>
          <input
            className="input-field w-full"
            placeholder="タイトル"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input-field min-h-[120px] w-full"
            placeholder="本文（日本語で入力。公開時に英・中・越へ自動翻訳されます ※自動翻訳が有効な場合）"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
              />
              すぐに公開する
            </label>
            <button type="button" className="btn-primary text-sm" disabled={saving} onClick={create}>
              {saving ? "保存中..." : "お知らせを作成"}
            </button>
          </div>
          {msg && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                msg.ok
                  ? "border-success/20 bg-success-dim text-success-text"
                  : "border-danger/20 bg-danger-dim text-danger-text"
              }`}
            >
              {msg.text}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="glass-card p-6 text-sm text-muted">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted">まだお知らせはありません。</div>
        ) : (
          items.map((a) => {
            const langs = a.translations ? Object.keys(a.translations) : [];
            return (
              <div key={a.id} className="glass-card space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{a.title}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        a.published
                          ? "border-success/40 bg-success-dim text-success-text"
                          : "border-border-default bg-surface text-muted"
                      }`}
                    >
                      {a.published ? "公開中" : "下書き"}
                    </span>
                    {langs.length > 0 && (
                      <span className="flex items-center gap-1">
                        {langs.map((l) => (
                          <span
                            key={l}
                            title="自動翻訳済み"
                            className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                          >
                            {LANG_LABEL[l] ?? l}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-[12px] px-2 py-1"
                        onClick={() => togglePublish(a)}
                      >
                        {a.published ? "非公開にする" : "公開する"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-[12px] px-2 py-1 text-danger-text"
                        onClick={() => remove(a)}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-secondary">{a.body}</p>
                <div className="text-[11px] text-muted">
                  {a.translated_at
                    ? `翻訳済み (${langs.map((l) => LANG_LABEL[l] ?? l).join(" / ")})`
                    : "翻訳なし（自動翻訳 OFF または未処理）"}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
