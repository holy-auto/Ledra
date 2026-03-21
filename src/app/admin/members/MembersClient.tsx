"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, ASSIGNABLE_ROLES, type Role } from "@/lib/auth/roles";

type Member = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string | null;
  is_self: boolean;
};

type MembersData = {
  members: Member[];
  plan_tier: string;
  member_count: number;
  member_limit: number | null;
  can_add: boolean;
};

function planLabel(tier?: string | null) {
  switch (tier) {
    case "free": return "フリー";
    case "starter": return "スターター";
    case "mini": return "スターター"; // 旧プラン互換
    case "standard": return "スタンダード";
    case "pro": return "プロ";
    default: return tier ?? "-";
  }
}

export default function MembersClient() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [addRole, setAddRole] = useState<Role>("staff");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/members", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j as MembersData);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchMembers();
      setLoading(false);
    })();
  }, [fetchMembers]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), display_name: displayName.trim() || undefined, role: addRole }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }
      setEmail("");
      setDisplayName("");
      setAddRole("staff");
      setAddMsg({ text: `${j.email} を追加しました`, ok: true });
      await fetchMembers();
    } catch (e: any) {
      setAddMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("このメンバーを削除しますか？")) return;
    setRemovingId(userId);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchMembers();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdatingRoleId(userId);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchMembers();
    } catch (e: any) {
      alert("ロール変更に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const limitLabel = data?.member_limit === null ? "無制限" : `${data?.member_limit}人`;

  return (
    <div className="space-y-6">

      <PageHeader
        tag="メンバー管理"
        title="メンバー管理"
        description="テナントに所属するメンバーの追加・削除を行います。"
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">プラン</div>
              <div className="mt-2 text-2xl font-bold text-primary">{planLabel(data.plan_tier)}</div>
              <div className="mt-1 text-xs text-muted">現在のプラン</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー数</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.member_count}</div>
              <div className="mt-1 text-xs text-muted">現在のメンバー数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">上限</div>
              <div className="mt-2 text-2xl font-bold text-primary">{limitLabel}</div>
              <div className="mt-1 text-xs text-muted">メンバー上限</div>
            </div>
          </section>

          {/* Limit warning */}
          {!data.can_add && (
            <div className="glass-card glow-amber p-5">
              <div className="text-sm font-semibold text-amber-400">
                メンバー上限（{limitLabel}）に達しています
              </div>
              <p className="mt-1 text-sm text-amber-400/80">
                追加するには{" "}
                <Link className="font-medium underline" href="/admin/billing">
                  プランをアップグレード
                </Link>{" "}
                してください。
              </p>
            </div>
          )}

          {/* Add member form */}
          <section className="glass-card p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー追加</div>
              <div className="mt-1 text-base font-semibold text-primary">新しいメンバーを招待</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted">メールアドレス <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  disabled={!data.can_add || adding}
                  className="input-field disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">表示名</label>
                <input
                  type="text"
                  placeholder="山田 太郎"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  disabled={!data.can_add || adding}
                  className="input-field disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">ロール</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as Role)}
                  disabled={!data.can_add || adding}
                  className="select-field disabled:opacity-50"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!data.can_add || adding || !email.trim()}
                className="btn-primary whitespace-nowrap"
              >
                {adding ? "追加中…" : "追加"}
              </button>
            </div>
            <p className="text-xs text-muted">※ 招待メールが送信されます。ユーザーがメール内のリンクからパスワードを設定します。</p>
            {addMsg && (
              <div className={`text-sm ${addMsg.ok ? "text-emerald-400" : "text-red-500"}`}>
                {addMsg.text}
              </div>
            )}
            {!data.can_add && (
              <div className="text-xs text-amber-400">
                上限に達しているため追加できません。
              </div>
            )}
          </section>

          {/* Member list */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle px-5 py-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold tracking-[0.12em] text-muted">名前</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold tracking-[0.12em] text-muted">メールアドレス</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold tracking-[0.12em] text-muted">ロール</th>
                    <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold tracking-[0.12em] text-muted">追加日</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.members.map((m) => (
                    <tr key={m.user_id} className="hover:bg-surface-hover/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">{m.display_name || "-"}</span>
                          {m.is_self && <Badge variant="info">自分</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        {m.email ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {m.is_self || m.role === "owner" ? (
                          <Badge variant={m.role === "owner" ? "warning" : "default"}>
                            {ROLE_LABELS[m.role as Role] ?? m.role}
                          </Badge>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.user_id, e.target.value as Role)}
                            disabled={updatingRoleId === m.user_id}
                            className="select-field py-1 px-2 text-xs min-w-[100px] disabled:opacity-50"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-secondary">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {m.is_self ? (
                          <span className="text-xs text-muted">-</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-danger px-3 py-1 text-xs"
                            disabled={removingId === m.user_id}
                            onClick={() => handleRemove(m.user_id)}
                          >
                            {removingId === m.user_id ? "削除中…" : "削除"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.members.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted">
                        メンバーがいません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
