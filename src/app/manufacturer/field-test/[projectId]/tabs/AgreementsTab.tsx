"use client";

import { useEffect, useState } from "react";
import { FT_AGREEMENT_TYPE_LABELS } from "@/types/manufacturer";
import type { FtAgreementType } from "@/types/manufacturer";

type Agreement = {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  agreement_type: FtAgreementType;
  accepted: boolean;
  accepted_at: string | null;
  created_at: string;
};

export default function AgreementsTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [items, setItems] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/manufacturer/field-test/agreements?project_id=${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setItems(json.agreements ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/manufacturer/field-test/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        tenant_id: fd.get("tenant_id"),
        agreement_type: fd.get("agreement_type"),
        document_text: fd.get("document_text") || undefined,
      }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const markAccepted = async (id: string) => {
    await fetch(`/api/manufacturer/field-test/agreements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    });
    load();
  };

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          >
            {showForm ? "閉じる" : "契約を追加"}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          <input name="tenant_id" required placeholder="テナントID (UUID)" className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <select name="agreement_type" required className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm">
            <option value="nda">秘密保持契約</option>
            <option value="terms">利用規約</option>
            <option value="other">その他</option>
          </select>
          <textarea name="document_text" placeholder="契約本文" rows={4} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" />
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "保存中..." : "追加"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
          契約がありません。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border-subtle bg-surface p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-primary">{a.tenant_name ?? a.tenant_id}</div>
                <div className="mt-0.5 text-xs text-secondary">{FT_AGREEMENT_TYPE_LABELS[a.agreement_type]}</div>
              </div>
              <div className="flex items-center gap-2">
                {a.accepted ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    承諾済 {a.accepted_at ? `(${new Date(a.accepted_at).toLocaleDateString("ja-JP")})` : ""}
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700">未承諾</span>
                    {isAdmin && (
                      <button
                        onClick={() => markAccepted(a.id)}
                        className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover"
                      >
                        承諾済にする
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
