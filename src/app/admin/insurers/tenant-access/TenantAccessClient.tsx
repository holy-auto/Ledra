"use client";

import { useEffect, useState, useCallback } from "react";

/* ── types ── */

type Grant = {
  id: string;
  insurer_id: string;
  tenant_id: string;
  granted_by: string | null;
  granted_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  insurer_name: string | null;
  tenant_name: string | null;
};

type InsurerOption = { id: string; name: string };
type TenantOption = { id: string; name: string };

/* ── component ── */

export default function TenantAccessClient() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Filter state
  const [filterInsurerId, setFilterInsurerId] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [insurers, setInsurers] = useState<InsurerOption[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [formInsurerId, setFormInsurerId] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* ── fetch grants ── */
  const fetchGrants = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterInsurerId ? `?insurer_id=${filterInsurerId}` : "";
      const res = await fetch(`/api/admin/insurers/tenant-access${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setGrants(json.grants ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterInsurerId]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  /* ── fetch insurers for dropdown ── */
  useEffect(() => {
    fetch("/api/admin/insurers", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setInsurers(
          (json.insurers ?? []).map((i: any) => ({ id: i.id, name: i.name }))
        );
      })
      .catch(() => {});
  }, []);

  /* ── fetch tenants for dropdown ── */
  const searchTenants = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/admin/insurers/tenant-access/tenants?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTenants(json.tenants ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    searchTenants(tenantSearch);
  }, [tenantSearch, searchTenants]);

  /* ── grant access ── */
  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!formInsurerId || !formTenantId) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/insurers/tenant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurer_id: formInsurerId,
          tenant_id: formTenantId,
          notes: formNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "failed");
      setMsg({ type: "ok", text: "アクセス許可を付与しました" });
      setFormInsurerId("");
      setFormTenantId("");
      setFormNotes("");
      setShowForm(false);
      fetchGrants();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "エラーが発生しました" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── revoke access ── */
  async function handleRevoke(id: string) {
    if (!confirm("このアクセス許可を取り消しますか？")) return;
    setActionBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/insurers/tenant-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "failed");
      setMsg({ type: "ok", text: "アクセス許可を取り消しました" });
      fetchGrants();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "エラーが発生しました" });
    } finally {
      setActionBusy(null);
    }
  }

  /* ── filtered grants ── */
  const filtered = showInactive ? grants : grants.filter((g) => g.is_active);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterInsurerId}
          onChange={(e) => setFilterInsurerId(e.target.value)}
          className="select-field max-w-xs"
        >
          <option value="">全ての保険会社</option>
          {insurers.map((ins) => (
            <option key={ins.id} value={ins.id}>{ins.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-border-default"
          />
          取り消し済みも表示
        </label>

        <div className="flex-1" />

        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          {showForm ? "キャンセル" : "新規許可"}
        </button>

        <div className="w-full text-sm text-muted">
          {loading ? "読み込み中..." : `${filtered.length} 件`}
        </div>
      </div>

      {/* Messages */}
      {msg && (
        <div className={`rounded-xl border p-3 text-sm ${msg.type === "err" ? "border-danger/30 bg-danger-dim text-danger-text" : "border-success/30 bg-success-dim text-success-text"}`}>
          {msg.text}
        </div>
      )}

      {/* Grant form */}
      {showForm && (
        <form onSubmit={handleGrant} className="glass-card p-5 space-y-4">
          <h3 className="text-base font-semibold text-primary">新規アクセス許可</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">
                保険会社 <span className="text-red-500">*</span>
              </label>
              <select
                value={formInsurerId}
                onChange={(e) => setFormInsurerId(e.target.value)}
                required
                className="select-field w-full"
              >
                <option value="">選択してください</option>
                {insurers.map((ins) => (
                  <option key={ins.id} value={ins.id}>{ins.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">
                テナント（施工店） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="テナント名で検索..."
                className="input-field w-full mb-1"
              />
              <select
                value={formTenantId}
                onChange={(e) => setFormTenantId(e.target.value)}
                required
                className="select-field w-full"
              >
                <option value="">選択してください</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-secondary">
                メモ（許可理由など）
              </label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="例：提携契約に基づく許可"
                className="input-field w-full"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !formInsurerId || !formTenantId}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {submitting ? "許可中..." : "アクセスを許可"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="overflow-x-auto glass-card">
        <table className="min-w-full text-sm">
          <thead className="bg-inset">
            <tr>
              <th className="p-3 text-left font-semibold text-secondary">保険会社</th>
              <th className="p-3 text-left font-semibold text-secondary">テナント（施工店）</th>
              <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
              <th className="p-3 text-left font-semibold text-secondary">メモ</th>
              <th className="p-3 text-left font-semibold text-secondary">許可日</th>
              <th className="p-3 text-left font-semibold text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-t hover:bg-surface-hover">
                <td className="p-3 font-medium text-primary">
                  {g.insurer_name ?? g.insurer_id.slice(0, 8)}
                </td>
                <td className="p-3 text-primary">
                  {g.tenant_name ?? g.tenant_id.slice(0, 8)}
                </td>
                <td className="p-3">
                  {g.is_active && !g.revoked_at ? (
                    <span className="inline-block rounded-full bg-success-dim px-2.5 py-0.5 text-xs font-semibold text-success-text">
                      有効
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-danger-dim px-2.5 py-0.5 text-xs font-semibold text-danger-text">
                      取消済み
                    </span>
                  )}
                </td>
                <td className="p-3 text-secondary max-w-[200px] truncate">
                  {g.notes || "-"}
                </td>
                <td className="p-3 whitespace-nowrap text-xs text-secondary">
                  {g.granted_at ? new Date(g.granted_at).toLocaleDateString("ja-JP") : "-"}
                </td>
                <td className="p-3">
                  {g.is_active && !g.revoked_at ? (
                    <button
                      onClick={() => handleRevoke(g.id)}
                      disabled={actionBusy === g.id}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-danger hover:bg-red-500/20 disabled:opacity-50"
                    >
                      取消
                    </button>
                  ) : (
                    <span className="text-xs text-muted">
                      {g.revoked_at ? new Date(g.revoked_at).toLocaleDateString("ja-JP") + " に取消" : "-"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted">
                  アクセス許可がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
