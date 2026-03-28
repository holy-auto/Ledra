"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type Tenant = {
  tenant_id: string;
  name: string;
  certificate_count: number;
  case_count: number;
  last_access: string | null;
};

type SortKey = "name" | "certificate_count" | "case_count" | "last_access";
type SortDir = "asc" | "desc";

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/insurer/tenants");
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.message ?? `HTTP ${res.status}`);
        }
        const j = await res.json();
        setTenants(j.tenants ?? []);
      } catch (e: any) {
        setError(e?.message ?? "データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...tenants];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, "ja");
          break;
        case "certificate_count":
          cmp = a.certificate_count - b.certificate_count;
          break;
        case "case_count":
          cmp = a.case_count - b.case_count;
          break;
        case "last_access":
          cmp =
            (a.last_access ?? "").localeCompare(b.last_access ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [tenants, sortKey, sortDir]);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              TENANTS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                テナント別統計
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                契約テナントごとの証明書数・案件数・最新アクセスを確認します。
              </p>
            </div>
          </div>
          <Link
            href="/insurer"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボードへ
          </Link>
        </header>

        {loading && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
            読み込み中...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                  TENANT LIST
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  契約テナント一覧
                </div>
              </div>
              {tenants.length > 0 && (
                <div className="text-sm text-neutral-500">
                  <span className="font-semibold text-neutral-900">
                    {tenants.length}
                  </span>{" "}
                  テナント
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th
                      className="p-3 text-left font-semibold text-neutral-600 cursor-pointer select-none hover:text-neutral-900"
                      onClick={() => toggleSort("name")}
                    >
                      テナント名{sortIcon("name")}
                    </th>
                    <th
                      className="p-3 text-right font-semibold text-neutral-600 cursor-pointer select-none hover:text-neutral-900"
                      onClick={() => toggleSort("certificate_count")}
                    >
                      証明書数{sortIcon("certificate_count")}
                    </th>
                    <th
                      className="p-3 text-right font-semibold text-neutral-600 cursor-pointer select-none hover:text-neutral-900"
                      onClick={() => toggleSort("case_count")}
                    >
                      案件数{sortIcon("case_count")}
                    </th>
                    <th
                      className="p-3 text-left font-semibold text-neutral-600 cursor-pointer select-none hover:text-neutral-900"
                      onClick={() => toggleSort("last_access")}
                    >
                      最新アクセス{sortIcon("last_access")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => (
                    <tr
                      key={t.tenant_id}
                      className="border-t hover:bg-neutral-50"
                    >
                      <td className="p-3 font-medium text-neutral-900">
                        {t.name}
                      </td>
                      <td className="p-3 text-right text-neutral-700">
                        {t.certificate_count.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-neutral-700">
                        {t.case_count.toLocaleString()}
                      </td>
                      <td className="p-3 text-neutral-600 whitespace-nowrap">
                        {t.last_access ? formatDateTime(t.last_access) : "-"}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-8 text-center text-sm text-neutral-500"
                      >
                        契約テナントがありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
