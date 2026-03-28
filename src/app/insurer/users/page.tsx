"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface InsurerUser {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  viewer: "閲覧者",
  auditor: "監査者",
};

export default function InsurerUsersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [callerRole, setCallerRole] = useState<string | null>(null);
  const [users, setUsers] = useState<InsurerUser[]>([]);
  const [maxUsers, setMaxUsers] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      // Fetch caller role from insurer_users
      try {
        const res = await fetch("/api/insurer/account");
        if (res.ok) {
          // Check role by fetching users list (admin only)
          const usersRes = await fetch("/api/insurer/users");
          if (usersRes.status === 403) {
            setCallerRole("viewer");
            setReady(true);
            setLoading(false);
            return;
          }
        }
      } catch {}
      setCallerRole("admin");
      setReady(true);
    })();
  }, [supabase]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insurer/users");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? "ユーザー一覧の取得に失敗しました。");
        return;
      }
      const j = await res.json();
      setUsers(j.users ?? []);
      setMaxUsers(j.max_users ?? 5);
    } catch {
      setError("ユーザー一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && callerRole === "admin") {
      fetchUsers();
    }
  }, [ready, callerRole, fetchUsers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/insurer/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          display_name: inviteName.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setInviteError(j.message ?? "招待に失敗しました。");
        return;
      }
      setInviteEmail("");
      setInviteName("");
      setInviteRole("viewer");
      setShowInvite(false);
      fetchUsers();
    } catch {
      setInviteError("招待に失敗しました。");
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateUser = async (
    userId: string,
    updates: { role?: string; is_active?: boolean },
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/insurer/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ insurer_user_id: userId, ...updates }),
      });
      if (res.ok) {
        fetchUsers();
        setEditingId(null);
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.message ?? "更新に失敗しました。");
      }
    } catch {
      alert("更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  if (callerRole !== "admin") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-3">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            USERS
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            ユーザー管理
          </h1>
        </header>
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            このページは管理者のみアクセスできます。
          </p>
        </div>
      </div>
    );
  }

  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          USERS
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          ユーザー管理
        </h1>
      </header>

      {/* Summary + Invite Button */}
      <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-neutral-600">
          現在{" "}
          <span className="font-bold text-neutral-900">{activeCount}</span> /{" "}
          {maxUsers} ユーザー（有効）
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          disabled={activeCount >= maxUsers}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          ユーザー招待
        </button>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-neutral-500">
            新規ユーザー招待
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                メールアドレス *
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                表示名
              </label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                ロール *
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              >
                <option value="viewer">閲覧者</option>
                <option value="auditor">監査者</option>
                <option value="admin">管理者</option>
              </select>
            </div>
          </div>
          {inviteError && (
            <p className="mt-3 text-sm text-red-600">{inviteError}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {inviting ? "招待中..." : "招待する"}
            </button>
            <button
              onClick={() => {
                setShowInvite(false);
                setInviteError(null);
              }}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="p-5 pb-0">
          <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-neutral-500">
            USER LIST
          </div>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-neutral-500">読み込み中...</div>
        ) : users.length === 0 ? (
          <div className="p-5 text-sm text-neutral-500">
            ユーザーが登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left font-semibold text-neutral-600">
                    名前
                  </th>
                  <th className="p-3 text-left font-semibold text-neutral-600">
                    メール
                  </th>
                  <th className="p-3 text-left font-semibold text-neutral-600">
                    ロール
                  </th>
                  <th className="p-3 text-left font-semibold text-neutral-600">
                    ステータス
                  </th>
                  <th className="p-3 text-left font-semibold text-neutral-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-neutral-100">
                    <td className="p-3 font-medium text-neutral-900">
                      {user.display_name || "-"}
                    </td>
                    <td className="p-3 text-neutral-600">
                      {user.email || "-"}
                    </td>
                    <td className="p-3">
                      {editingId === user.id ? (
                        <select
                          defaultValue={user.role}
                          onChange={(e) =>
                            handleUpdateUser(user.id, { role: e.target.value })
                          }
                          disabled={saving}
                          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none"
                        >
                          <option value="admin">管理者</option>
                          <option value="viewer">閲覧者</option>
                          <option value="auditor">監査者</option>
                        </select>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {user.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {editingId === user.id ? (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-neutral-500 hover:text-neutral-700"
                          >
                            閉じる
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingId(user.id)}
                            className="text-xs text-neutral-500 hover:text-neutral-700"
                          >
                            編集
                          </button>
                        )}
                        <button
                          onClick={() =>
                            handleUpdateUser(user.id, {
                              is_active: !user.is_active,
                            })
                          }
                          disabled={saving}
                          className={`text-xs ${
                            user.is_active
                              ? "text-red-500 hover:text-red-700"
                              : "text-emerald-500 hover:text-emerald-700"
                          }`}
                        >
                          {user.is_active ? "無効化" : "有効化"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
