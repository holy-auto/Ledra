"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState } from "react";

export default function InquiryForm({ vehicleId, vehicleLabel }: { vehicleId: string; vehicleLabel: string }) {
  const [form, setForm] = useState({
    buyer_name: "",
    buyer_company: "",
    buyer_email: "",
    buyer_phone: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/market/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, ...form }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.error ?? `送信に失敗しました (${res.status})`);
      setResult({ ok: true, text: "お問い合わせを送信しました。担当者より連絡いたします。" });
      setForm({ buyer_name: "", buyer_company: "", buyer_email: "", buyer_phone: "", message: "" });
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card p-5 mt-6">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">INQUIRY</div>
      <h3 className="text-lg font-bold text-primary mb-4">この車両について問い合わせる</h3>
      <p className="text-sm text-muted mb-4">「{vehicleLabel}」に関するお問い合わせ</p>

      {result && <div className={`mb-4 text-sm ${result.ok ? "text-emerald-600" : "text-red-500"}`}>{result.text}</div>}

      {!result?.ok && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">
                お名前 <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                required
                value={form.buyer_name}
                onChange={(e) => setForm((p) => ({ ...p, buyer_name: e.target.value }))}
                className="input-field"
                placeholder="山田 太郎"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">会社名</span>
              <input
                type="text"
                value={form.buyer_company}
                onChange={(e) => setForm((p) => ({ ...p, buyer_company: e.target.value }))}
                className="input-field"
                placeholder="株式会社○○"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">
                メールアドレス <span className="text-red-500">*</span>
              </span>
              <input
                type="email"
                required
                value={form.buyer_email}
                onChange={(e) => setForm((p) => ({ ...p, buyer_email: e.target.value }))}
                className="input-field"
                placeholder="info@example.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">電話番号</span>
              <input
                type="tel"
                value={form.buyer_phone}
                onChange={(e) => setForm((p) => ({ ...p, buyer_phone: e.target.value }))}
                className="input-field"
                placeholder="03-0000-0000"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-secondary">
              メッセージ <span className="text-red-500">*</span>
            </span>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
              className="input-field"
              placeholder="ご質問やご要望をお書きください"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "送信中…" : "問い合わせを送信"}
          </button>
        </form>
      )}
    </section>
  );
}
