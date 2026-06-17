"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import MutationGuard from "@/components/ui/MutationGuard";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatDate, formatJpy } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  型                                                                  */
/* ------------------------------------------------------------------ */
type Organization = {
  id: string;
  name: string;
  member_count: number;
  created_at: string;
  updated_at: string;
};

type OrgMember = {
  id: string;
  tenant_id: string;
  role: string;
  joined_at: string;
  tenant_name: string | null;
  plan_tier: string | null;
};

type DashboardTenant = {
  tenant_id: string;
  tenant_name: string | null;
  reservations_this_month: number;
  revenue_this_month: number;
  active_jobs: number;
};

type DashboardTotals = {
  reservations: number;
  revenue: number;
  active_jobs: number;
};

type Toast = { type: "success" | "error"; msg: string };

/* ------------------------------------------------------------------ */
/*  メインコンポーネント                                                */
/* ------------------------------------------------------------------ */
export default function OrganizationsClient() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // 作成フォーム
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // 選択中の組織 (ダッシュボード表示用)
  const [selected, setSelected] = useState<Organization | null>(null);

  // メンバー管理ダイアログ対象
  const [managing, setManaging] = useState<Organization | null>(null);

  const showToast = useCallback((type: Toast["type"], msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/organizations", { cache: "no-store" });
      const json = await parseJsonSafe<{ organizations?: Organization[] }>(res);
      if (!res.ok) throw new Error("組織の読み込みに失敗しました");
      setOrgs(Array.isArray(json?.organizations) ? json!.organizations : []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(json?.message ?? "作成に失敗しました");
      setNewName("");
      showToast("success", "組織を作成しました");
      await fetchOrgs();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }, [newName, fetchOrgs, showToast]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="組織管理"
        title="組織管理"
        description="複数の店舗アカウントを束ねる組織を作成し、横断ダッシュボードで全店舗の実績を俯瞰します。"
      />

      {/* ── 組織一覧 ── */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">組織一覧</div>
        </div>

        {/* 新規組織フォーム (オーナーのみ) */}
        <MutationGuard
          minRole="owner"
          fallback={<p className="text-xs text-muted">組織の作成・編集はオーナー権限が必要です。</p>}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-xs text-muted">新しい組織名</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="例: ○○グループ"
                className="input-field"
                maxLength={120}
              />
            </div>
            <button type="button" className="btn-primary" disabled={creating || !newName.trim()} onClick={handleCreate}>
              {creating ? "作成中…" : "+ 新規組織"}
            </button>
          </div>
        </MutationGuard>

        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            組織がまだありません。上のフォームから作成してください。
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                isSelected={selected?.id === org.id}
                onSelect={() => setSelected(org)}
                onManage={() => setManaging(org)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 組織ダッシュボード ── */}
      {selected && <OrganizationDashboard org={selected} onError={(m) => showToast("error", m)} />}

      {/* ── メンバー管理ダイアログ ── */}
      {managing && (
        <MemberManageDialog
          org={managing}
          onClose={() => setManaging(null)}
          onChanged={() => {
            // メンバー数が変わるので一覧を更新する。
            fetchOrgs();
          }}
          onToast={showToast}
        />
      )}

      {/* ── トースト ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  組織カード                                                          */
/* ------------------------------------------------------------------ */
function OrgCard({
  org,
  isSelected,
  onSelect,
  onManage,
}: {
  org: Organization;
  isSelected: boolean;
  onSelect: () => void;
  onManage: () => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface p-4 transition-colors ${
        isSelected ? "border-accent" : "border-border-default"
      }`}
    >
      <div className="text-base font-semibold text-primary">{org.name}</div>
      <div className="mt-1 text-xs text-muted">作成日 {formatDate(org.created_at)}</div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-inset px-2.5 py-1 text-xs text-secondary">
        <span className="font-semibold text-primary">{org.member_count}</span> 店舗
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onSelect}>
          ダッシュボード
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onManage}>
          メンバー管理
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  組織ダッシュボード                                                  */
/* ------------------------------------------------------------------ */
function OrganizationDashboard({ org, onError }: { org: Organization; onError: (m: string) => void }) {
  const [tenants, setTenants] = useState<DashboardTenant[]>([]);
  const [totals, setTotals] = useState<DashboardTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/organizations/${org.id}/dashboard`, { cache: "no-store" });
        const json = await parseJsonSafe<{ tenants?: DashboardTenant[]; totals?: DashboardTotals }>(res);
        if (!res.ok) throw new Error("ダッシュボードの取得に失敗しました");
        if (!active) return;
        setTenants(Array.isArray(json?.tenants) ? json!.tenants : []);
        setTotals(json?.totals ?? null);
      } catch (e) {
        if (active) onError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [org.id, onError]);

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">組織ダッシュボード</div>
        <div className="mt-1 text-base font-semibold text-primary">{org.name} ・ 今月の実績</div>
      </div>

      {loading ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : tenants.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">この組織にはまだ店舗が追加されていません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">店舗</th>
                <th className="px-5 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">今月の予約</th>
                <th className="px-5 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">今月の売上</th>
                <th className="px-5 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">進行中案件</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {tenants.map((t) => (
                <tr key={t.tenant_id} className="hover:bg-surface-hover/60">
                  <td className="px-5 py-3.5 font-medium text-primary">{t.tenant_name ?? "(名称未設定)"}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-secondary">{t.reservations_this_month}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-medium text-primary">
                    {formatJpy(t.revenue_this_month)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-secondary">{t.active_jobs}</td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="border-t border-border-default bg-inset">
                  <td className="px-5 py-3.5 text-xs font-semibold tracking-[0.12em] text-muted">合計</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-primary">
                    {totals.reservations}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-primary">
                    {formatJpy(totals.revenue)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-primary">
                    {totals.active_jobs}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  メンバー管理ダイアログ                                              */
/* ------------------------------------------------------------------ */
function MemberManageDialog({
  org,
  onClose,
  onChanged,
  onToast,
}: {
  org: Organization;
  onClose: () => void;
  onChanged: () => void;
  onToast: (type: Toast["type"], msg: string) => void;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}/members`, { cache: "no-store" });
      const json = await parseJsonSafe<{ members?: OrgMember[] }>(res);
      if (!res.ok) throw new Error("メンバーの読み込みに失敗しました");
      setMembers(Array.isArray(json?.members) ? json!.members : []);
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [org.id, onToast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleAdd = useCallback(async () => {
    const tid = tenantId.trim();
    if (!tid) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tid }),
      });
      const json = await parseJsonSafe<{ message?: string }>(res);
      if (!res.ok) throw new Error(json?.message ?? "店舗の追加に失敗しました");
      setTenantId("");
      onToast("success", "店舗を追加しました");
      await fetchMembers();
      onChanged();
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }, [tenantId, org.id, fetchMembers, onChanged, onToast]);

  const handleRemove = useCallback(
    async (member: OrgMember) => {
      if (!confirm(`「${member.tenant_name ?? member.tenant_id}」を組織から除外しますか？`)) return;
      setRemovingId(member.id);
      try {
        const res = await fetch(
          `/api/admin/organizations/${org.id}/members?tenant_id=${encodeURIComponent(member.tenant_id)}`,
          { method: "DELETE" },
        );
        const json = await parseJsonSafe<{ message?: string }>(res);
        if (!res.ok) throw new Error(json?.message ?? "除外に失敗しました");
        onToast("success", "店舗を除外しました");
        await fetchMembers();
        onChanged();
      } catch (e) {
        onToast("error", e instanceof Error ? e.message : "除外に失敗しました");
      } finally {
        setRemovingId(null);
      }
    },
    [org.id, fetchMembers, onChanged, onToast],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー管理</div>
            <h2 className="mt-1 text-lg font-bold text-primary">{org.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 店舗追加 (オーナーのみ) */}
        <MutationGuard
          minRole="owner"
          fallback={<p className="mb-4 text-xs text-muted">店舗の追加・除外はオーナー権限が必要です。</p>}
        >
          <div className="mb-4 space-y-1">
            <label className="text-xs text-muted">店舗を追加 (テナントID)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
                placeholder="テナント (店舗) の UUID"
                className="input-field flex-1"
              />
              <button type="button" className="btn-primary" disabled={adding || !tenantId.trim()} onClick={handleAdd}>
                {adding ? "追加中…" : "追加"}
              </button>
            </div>
          </div>
        </MutationGuard>

        {/* メンバー一覧 */}
        {loading ? (
          <div className="flex min-h-[100px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">まだ店舗が追加されていません。</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-primary">{m.tenant_name ?? "(名称未設定)"}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    {m.plan_tier && (
                      <span className="rounded-full bg-inset px-2 py-0.5 uppercase tracking-wide">{m.plan_tier}</span>
                    )}
                    <span>追加日 {formatDate(m.joined_at)}</span>
                  </div>
                </div>
                <MutationGuard minRole="owner">
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
                    disabled={removingId === m.id}
                    onClick={() => handleRemove(m)}
                  >
                    {removingId === m.id ? "除外中…" : "除外"}
                  </button>
                </MutationGuard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
