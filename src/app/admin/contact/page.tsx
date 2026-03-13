"use client";

import { useEffect, useState } from "react";

export default function ContactSettingsPage() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [line, setLine] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/contact", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        setPhone(j.contact_phone ?? "");
        setEmail(j.contact_email ?? "");
        setLine(j.contact_line ?? "");
        setNote(j.contact_note ?? "");
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_phone: phone.trim(),
          contact_email: email.trim(),
          contact_line: line.trim(),
          contact_note: note.trim(),
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "連絡先を保存しました" });
      } else {
        setMessage({ type: "error", text: "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            CONTACT
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">連絡先設定</h1>
          <p className="text-sm text-neutral-500">
            証明書ページに表示される店舗の連絡先を設定します
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-neutral-400 py-8 text-center">読み込み中...</div>
        ) : (
          <form onSubmit={onSave} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">電話番号</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                placeholder="03-1234-5678"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                placeholder="shop@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">LINE ID</label>
              <input
                type="text"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                placeholder="@shop-line-id"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">備考</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 resize-y"
                placeholder="営業時間など"
              />
            </div>

            {message && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  message.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
