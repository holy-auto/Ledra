"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type NfcRow = {
  id: string;
  tag_code: string | null;
  uid: string | null;
  vehicle_id: string | null;
  certificate_id: string | null;
  status: string | null;
  written_at: string | null;
  attached_at: string | null;
  created_at: string | null;
};

type VehicleInfo = {
  id: string;
  maker?: string | null;
  model?: string | null;
  year?: number | null;
  plate_display?: string | null;
  customer_name?: string | null;
};

type CertInfo = {
  id: string;
  public_id?: string | null;
  status?: string | null;
};

type Props = {
  initialRows: NfcRow[];
  vehicleMap: Record<string, VehicleInfo>;
  certMap: Record<string, CertInfo>;
  isAdmin: boolean;
};

function tagStatusMeta(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "attached") return { label: "貼付済", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "written")  return { label: "書込済", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  if (s === "prepared") return { label: "未書込", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "lost")     return { label: "紛失",   cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "retired")  return { label: "廃止",   cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "error")    return { label: "エラー", cls: "bg-red-50 text-red-700 border-red-200" };
  return { label: status ?? "未設定", cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };
}

function certStatusMeta(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active")   return { label: "有効",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "void")     return { label: "無効",     cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "draft")    return { label: "下書き",   cls: "bg-blue-50 text-blue-700 border-blue-200" };
  if (s === "expired")  return { label: "期限切れ", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: status ?? "不明", cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };
}

function vehicleLabel(v: VehicleInfo | null) {
  if (!v) return "-";
  const head = [v.maker, v.model].filter(Boolean).join(" ");
  const tail = [v.year ? `${v.year}年` : "", v.plate_display ?? ""].filter(Boolean).join(" / ");
  if (head && tail) return `${head} (${tail})`;
  return head || tail || "-";
}

export default function NfcClient({ initialRows, vehicleMap, certMap, isAdmin }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const total = rows.length;
  const attached = rows.filter((r) => r.status === "attached").length;
  const written  = rows.filter((r) => r.status === "written").length;
  const prepared = rows.filter((r) => r.status === "prepared").length;

  async function handleRetire(id: string) {
    setLoading(id);
    try {
      const res = await fetch("/api/admin/nfc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, status: "retired" } : r));
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/admin/nfc?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setLoading(null);
      setConfirmDelete(null);
    }
  }

  return (
    <>
      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">合計</div>
          <div className="mt-2 text-2xl font-bold text-neutral-900">{total}</div>
          <div className="mt-1 text-xs text-neutral-500">登録タグ数</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-[0.18em] text-emerald-600">紐付済</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{attached}</div>
          <div className="mt-1 text-xs text-emerald-600">貼付済み</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-[0.18em] text-sky-600">書込済</div>
          <div className="mt-2 text-2xl font-bold text-sky-700">{written}</div>
          <div className="mt-1 text-xs text-sky-600">書込済み</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-[0.18em] text-amber-600">準備済</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{prepared}</div>
          <div className="mt-1 text-xs text-amber-600">未書込み</div>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="p-5 border-b border-neutral-100">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">タグ一覧</div>
          <div className="mt-1 text-base font-semibold text-neutral-900">タグ台帳</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            NFCタグがまだ登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">タグコード</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">車両 / 顧客</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-neutral-500">証明書</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-neutral-500">UID</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-neutral-500">書込日時</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-neutral-500">貼付日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row) => {
                  const v = row.vehicle_id ? vehicleMap[row.vehicle_id] ?? null : null;
                  const c = row.certificate_id ? certMap[row.certificate_id] ?? null : null;
                  const tagMeta = tagStatusMeta(row.status);
                  const cMeta = certStatusMeta(c?.status);
                  const publicId = c?.public_id?.trim() ?? "";
                  const isRetired = row.status === "retired";
                  const isLoading = loading === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-neutral-50 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tagMeta.cls}`}>
                          {tagMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.tag_code ?? "-"}</td>
                      <td className="px-4 py-3">
                        {v ? (
                          <Link href={`/admin/vehicles/${row.vehicle_id}`} className="font-medium text-neutral-900 hover:underline">
                            {vehicleLabel(v)}
                          </Link>
                        ) : <span className="text-neutral-500">-</span>}
                        {v?.customer_name && (
                          <div className="mt-0.5 text-xs text-neutral-500">{v.customer_name}</div>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3">
                        {publicId ? (
                          <div className="space-y-1">
                            <Link href={`/c/${publicId}`} target="_blank" className="font-mono text-xs text-neutral-700 hover:underline">
                              {publicId}
                            </Link>
                            <div>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cMeta.cls}`}>
                                {cMeta.label}
                              </span>
                            </div>
                          </div>
                        ) : <span className="text-neutral-500">-</span>}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-neutral-500">{row.uid ?? "-"}</td>
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs text-neutral-500">{formatDateTime(row.written_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs text-neutral-500">{formatDateTime(row.attached_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {!isRetired && (
                            <button
                              onClick={() => handleRetire(row.id)}
                              disabled={isLoading}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                            >
                              {isLoading ? "..." : "廃止"}
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              {confirmDelete === row.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(row.id)}
                                    disabled={isLoading}
                                    className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                                  >
                                    {isLoading ? "..." : "確認"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(row.id)}
                                  className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100 transition-colors"
                                >
                                  削除
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
