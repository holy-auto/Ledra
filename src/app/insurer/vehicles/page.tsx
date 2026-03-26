"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

type VehicleRow = {
  vehicle_id: string;
  maker: string;
  model: string;
  year: number | null;
  plate_display: string;
  vin_code: string;
  size_class: string;
  tenant_name: string;
  certificate_count: number;
  latest_cert_public_id: string | null;
  latest_cert_status: string | null;
  latest_cert_created_at: string | null;
};

export default function InsurerVehiclesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    setSearched(true);
    try {
      const qs = new URLSearchParams({
        q: q.trim(),
        limit: "50",
        offset: "0",
      });
      const res = await fetch(`/api/insurer/vehicles?${qs.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "search_failed");
      setRows(j?.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "search_failed");
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          VEHICLE SEARCH
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            車両検索
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            車台番号・ナンバー・車種で車両を検索し、証明書履歴を確認できます。
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="車台番号（完全一致） / ナンバー / 車種"
            className="flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
          <button
            onClick={runSearch}
            disabled={busy || !q.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? "検索中..." : "検索"}
          </button>
        </div>
        {err && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
              RESULTS
            </div>
            <div className="mt-1 text-base font-semibold text-neutral-900">
              検索結果
            </div>
          </div>
          {rows.length > 0 && (
            <div className="text-sm text-neutral-500">
              <span className="font-semibold text-neutral-900">
                {rows.length}
              </span>{" "}
              件
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  車台番号
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  メーカー
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  車種
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  年式
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  ナンバー
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  証明書数
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  最新証明書
                </th>
                <th className="p-3 text-left font-semibold text-neutral-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicle_id} className="border-t hover:bg-neutral-50">
                  <td className="p-3 font-mono text-xs text-neutral-700">
                    {r.vin_code || "-"}
                  </td>
                  <td className="p-3 text-neutral-600">{r.maker || "-"}</td>
                  <td className="p-3 font-medium text-neutral-900">
                    {r.model || "-"}
                  </td>
                  <td className="p-3 text-neutral-600">{r.year ?? "-"}</td>
                  <td className="p-3 text-neutral-600">
                    {r.plate_display || "-"}
                  </td>
                  <td className="p-3 text-neutral-600">
                    {r.certificate_count}
                  </td>
                  <td className="p-3 text-neutral-600">
                    {r.latest_cert_public_id ? (
                      <div>
                        <span
                          className={
                            r.latest_cert_status === "void"
                              ? "text-red-600"
                              : "text-emerald-600"
                          }
                        >
                          {r.latest_cert_status === "active" ? "有効" : "無効"}
                        </span>
                        <div className="mt-0.5 text-xs text-neutral-400">
                          {r.latest_cert_created_at
                            ? formatDateTime(r.latest_cert_created_at)
                            : ""}
                        </div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/insurer/vehicles/${r.vehicle_id}`}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
              {searched && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-sm text-neutral-500"
                  >
                    該当する車両が見つかりません。
                  </td>
                </tr>
              )}
              {!searched && (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-sm text-neutral-500"
                  >
                    検索キーワードを入力してください。車台番号での完全一致検索が最も正確です。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
