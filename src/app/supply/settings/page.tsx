"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { SUPPLY_PARTNER_STATUS_LABELS, normalizeSupplyPartnerStatus, type SupplyPartnerProfile } from "@/types/supply";

export default function SupplySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("active_pending_review");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supply/profile", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        const partner = j?.partner as SupplyPartnerProfile | null;
        if (partner) {
          setName(partner.name ?? "");
          setEmail(partner.contact_email ?? "");
          setPhone(partner.contact_phone ?? "");
          setStatus(partner.status ?? "active_pending_review");
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/supply/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact_email: email.trim() || null,
          contact_phone: phone.trim() || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: "保存しました。" });
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl p-5 text-sm text-muted">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader tag="SUPPLY PORTAL" title="プロフィール" description="事業者名と連絡先を管理します。" />

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">審査ステータス:</span>
          <span className="font-medium text-primary">
            {SUPPLY_PARTNER_STATUS_LABELS[normalizeSupplyPartnerStatus(status)]}
          </span>
        </div>

        <label>
          <div className="text-sm text-secondary mb-1">事業者名 *</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" />
        </label>
        <label>
          <div className="text-sm text-secondary mb-1">連絡先メール</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field w-full"
            placeholder="sales@example.com"
          />
        </label>
        <label>
          <div className="text-sm text-secondary mb-1">連絡先電話</div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field w-full" />
        </label>

        {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

        <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
