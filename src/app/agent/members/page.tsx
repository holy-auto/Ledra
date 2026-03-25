"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
}

interface MembersData {
  members: Member[];
  current_user_role: string;
}

const ROLE_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  admin: { variant: "violet", label: "管理者" },
  manager: { variant: "info", label: "マネージャー" },
  member: { variant: "default", label: "メンバー" },
};

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  active: { variant: "success", label: "有効" },
  invited: { variant: "warning", label: "招待中" },
  inactive: { variant: "default", label: "無効" },
};

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "manager", label: "マネージャー" },
  { value: "member", label: "メンバー" },
];

export default function AgentMembersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Role change state
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const isAdmin = currentUserRole === "admin";

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/agent/login";
    });
  }, [supabase]);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/members");
      if (!res.ok) throw new Error("メンバー情報の取得に失敗しました");
      const json: MembersData = await res.json();
      setMembers(json.members ?? []);
      setCurrentUserRole(json.current_user_role ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Invite member
  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/agent/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "招待に失敗しました");
      }
      setInviteName("");
      setInviteEmail("");
      setInviteRole("member");
      setShowInvite(false);
      fetchMembers();
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setInviting(false);
    }
  };

  // Change role
  const handleRoleChange = async (memberId: string, newRole: string) => {
    setChangingRoleId(memberId);
    try {
      const res = await fetch(`/api/agent/members/${memberId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("ロール変更に失敗しました");
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
      );
    } catch {
      // Revert on error - refetch
      fetchMembers();
    } finally {
      setChangingRoleId(null);
    }
  };

  /* ── Skeleton ── */
  const Skeleton = () => (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-border-default p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="divide-y divide-border-default">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 px-5 py-4">
            <div className="h-4 w-28 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-40 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-16 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-28 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-1">
          <span className="section-tag">MEMBERS</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">
            メンバー管理
          </h1>
          <p className="text-[14px] text-secondary leading-relaxed">
            チームメンバーの管理・招待を行います。
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowInvite(!showInvite)}
          >
            {showInvite ? "キャンセル" : "メンバー招待"}
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isAdmin && (
        <div className="glass-card p-5 space-y-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">
            新規メンバー招待
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs text-muted">名前</span>
              <input
                type="text"
                placeholder="山田太郎"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="input-field"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted">メールアドレス</span>
              <input
                type="email"
                placeholder="example@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input-field"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted">ロール</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="input-field"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {inviteError && (
            <p className="text-sm text-danger">{inviteError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={handleInvite}
              disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
            >
              {inviting ? "送信中..." : "招待を送信"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowInvite(false);
                setInviteError(null);
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="glass-card p-6">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">名前</th>
                <th className="px-4 py-3 font-medium">メールアドレス</th>
                <th className="px-4 py-3 font-medium">ロール</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">参加日</th>
                {isAdmin && (
                  <th className="px-4 py-3 font-medium">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-4 py-10 text-center text-muted"
                  >
                    メンバーが登録されていません。
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const role = ROLE_MAP[m.role] ?? {
                    variant: "default" as BadgeVariant,
                    label: m.role,
                  };
                  const status = STATUS_MAP[m.status] ?? {
                    variant: "default" as BadgeVariant,
                    label: m.status,
                  };
                  const isChanging = changingRoleId === m.id;

                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border-default hover:bg-surface-hover/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-primary">
                        {m.name}
                      </td>
                      <td className="px-4 py-3 text-secondary">{m.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={role.variant}>{role.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-secondary whitespace-nowrap">
                        {formatDateTime(m.joined_at)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <select
                            value={m.role}
                            onChange={(e) =>
                              handleRoleChange(m.id, e.target.value)
                            }
                            disabled={isChanging}
                            className="input-field text-xs py-1 px-2 w-auto"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
