"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  search: "証明書検索",
  view: "証明書閲覧",
  export_csv: "CSVエクスポート",
  download_pdf: "PDFダウンロード",
  pii_disclosure_request: "PII開示要求",
  vehicle_search: "車両検索",
  case_create: "案件作成",
  case_update: "案件更新",
  bulk_status_change: "一括ステータス変更",
};

const ACTION_OPTIONS = [
  { value: "", label: "全て" },
  { value: "search", label: "証明書検索" },
  { value: "view", label: "証明書閲覧" },
  { value: "export_csv", label: "CSVエクスポート" },
  { value: "download_pdf", label: "PDFダウンロード" },
  { value: "pii_disclosure_request", label: "PII開示要求" },
  { value: "vehicle_search", label: "車両検索" },
  { value: "case_create", label: "案件作成" },
  { value: "case_update", label: "案件更新" },
  { value: "bulk_status_change", label: "一括ステータス変更" },
];

interface AuditLog {
  id: string;
  action: string;
  meta: Record<string, any> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  certificate_id: string | null;
  insurer_user_id: string | null;
  user_display_name: string | null;
}

interface UserOption {
  id: string;
  display_name: string;
}

export default function InsurerAuditPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    })();
  }, [supabase]);

  const fetchLogs = useCallback(
    async (newOffset = 0, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(newOffset),
        });
        if (filterAction) params.set("action", filterAction);
        if (filterUser) params.set("user_id", filterUser);
        if (filterDateFrom) params.set("date_from", filterDateFrom);
        if (filterDateTo) params.set("date_to", filterDateTo);

        const res = await fetch(`/api/insurer/audit?${params}`);
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) return;

        const j = await res.json();
        const newLogs = j.logs ?? [];

        if (append) {
          setLogs((prev) => [...prev, ...newLogs]);
        } else {
          setLogs(newLogs);
        }
        if (j.users) {
          setUserOptions(j.users);
        }
        setHasMore(newLogs.length >= LIMIT);
        setOffset(newOffset + newLogs.length);
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [filterAction, filterUser, filterDateFrom, filterDateTo],
  );

  useEffect(() => {
    if (ready) {
      setOffset(0);
      fetchLogs(0, false);
    }
  }, [ready, fetchLogs]);

  const handleLoadMore = () => {
    fetchLogs(offset, true);
  };

  if (!ready) return null;

  if (forbidden) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-3">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            AUDIT LOG
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            操作ログ
          </h1>
        </header>
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            このページは管理者または監査者のみアクセスできます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          AUDIT LOG
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          操作ログ
        </h1>
      </header>

      {/* Filters */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-xs font-semibold tracking-[0.18em] text-neutral-500">
          FILTERS
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              操作種別
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              ユーザー
            </label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            >
              <option value="">全て</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              開始日
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              終了日
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="p-5 pb-0">
          <div className="mb-4 text-xs font-semibold tracking-[0.18em] text-neutral-500">
            LOG ENTRIES
          </div>
        </div>
        {loading && logs.length === 0 ? (
          <div className="p-5 text-sm text-neutral-500">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="p-5 text-sm text-neutral-500">
            該当する操作ログがありません。
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      日時
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      ユーザー
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      操作
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      詳細
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t border-neutral-100"
                    >
                      <td className="whitespace-nowrap p-3 text-neutral-600">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="p-3 text-neutral-700">
                        {log.user_display_name || "-"}
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="max-w-xs truncate p-3 font-mono text-xs text-neutral-500">
                        {log.meta ? formatMeta(log.meta) : "-"}
                      </td>
                      <td className="p-3 text-xs text-neutral-500">
                        {log.ip ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="border-t border-neutral-100 p-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="rounded-xl border border-neutral-200 px-6 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300"
                >
                  {loading ? "読み込み中..." : "さらに読み込む"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Format meta JSONB into a readable summary */
function formatMeta(meta: Record<string, any>): string {
  if (!meta || Object.keys(meta).length === 0) return "-";
  const parts: string[] = [];
  if (meta.query) parts.push(`検索: ${meta.query}`);
  if (meta.certificate_public_id) parts.push(`証明書: ${meta.certificate_public_id}`);
  if (meta.vehicle_id) parts.push(`車両: ${meta.vehicle_id}`);
  if (meta.case_id) parts.push(`案件: ${meta.case_id}`);
  if (meta.count) parts.push(`件数: ${meta.count}`);
  if (parts.length > 0) return parts.join(" / ");
  return JSON.stringify(meta);
}
