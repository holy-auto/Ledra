"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

export default function NewReferralPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    shop_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shop_name.trim()) {
      setError("店舗名は必須です。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      router.push("/agent/referrals");
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        tag="REFERRALS"
        title="新規紹介登録"
        description="新しい紹介先店舗の情報を入力してください。"
        actions={
          <Link href="/agent/referrals" className="btn-ghost text-xs">
            &larr; 紹介一覧に戻る
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">NEW REFERRAL</div>
          <div className="mt-1 text-base font-semibold text-primary">紹介先情報を入力</div>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger-dim px-4 py-3 text-sm text-danger">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 店舗名 (required) */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted">
              店舗名 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.shop_name}
              onChange={set("shop_name")}
              className="input-field"
              placeholder="〇〇自動車販売"
              required
            />
          </div>

          {/* 担当者名 */}
          <div className="space-y-1">
            <label className="text-xs text-muted">担当者名</label>
            <input
              type="text"
              value={form.contact_name}
              onChange={set("contact_name")}
              className="input-field"
              placeholder="山田 太郎"
            />
          </div>

          {/* 電話番号 */}
          <div className="space-y-1">
            <label className="text-xs text-muted">電話番号</label>
            <input
              type="tel"
              value={form.contact_phone}
              onChange={set("contact_phone")}
              className="input-field"
              placeholder="090-1234-5678"
            />
          </div>

          {/* メールアドレス */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted">メールアドレス</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={set("contact_email")}
              className="input-field"
              placeholder="shop@example.com"
            />
          </div>
        </div>

        {/* 備考 */}
        <div className="space-y-1">
          <label className="text-xs text-muted">備考</label>
          <textarea
            value={form.note}
            onChange={set("note")}
            className="input-field"
            rows={3}
            placeholder="補足情報があれば入力してください"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saving || !form.shop_name.trim()}>
            {saving ? "登録中…" : "登録する"}
          </button>
          <Link href="/agent/referrals" className="btn-secondary rounded-xl border bg-surface">
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
