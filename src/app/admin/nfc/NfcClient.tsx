"use client";

import { useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
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
  if (s === "attached") return { label: "貼付済", cls: "bg-success-dim text-success-text border-success/30" };
  if (s === "written") return { label: "書込済", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  if (s === "prepared") return { label: "未書込", cls: "bg-warning-dim text-warning-text border-warning/30" };
  if (s === "lost") return { label: "紛失", cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "retired") return { label: "廃止", cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "error") return { label: "エラー", cls: "bg-red-50 text-red-700 border-red-200" };
  return { label: status ?? "未設定", cls: "bg-inset text-secondary border-border-default" };
}

function certStatusMeta(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return { label: "有効", cls: "bg-success-dim text-success-text border-success/30" };
  if (s === "void") return { label: "無効", cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "draft") return { label: "下書き", cls: "bg-accent-dim text-accent-text border-accent/30" };
  if (s === "expired") return { label: "期限切れ", cls: "bg-warning-dim text-warning-text border-warning/30" };
  return { label: status ?? "不明", cls: "bg-inset text-secondary border-border-default" };
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
  const [statusTab, setStatusTab] = useState<"all" | "attached" | "written" | "prepared">("all");

  const total = rows.length;
  const attached = rows.filter((r) => r.status === "attached").length;
  const written = rows.filter((r) => r.status === "written").length;
  const prepared = rows.filter((r) => r.status === "prepared").length;

  const visibleRows = statusTab === "all" ? rows : rows.filter((r) => r.status === statusTab);

  async function handleRetire(id: string) {
    setLoading(id);
    try {
      const res = await fetch("/api/admin/nfc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "retired" } : r)));
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
    <div className="space-y-6">
      <PageHeader
        tag="NFCタグ"
        title="NFCタグ管理"
        description="NFCタグの台帳・状態・証明書／車両との紐付けを確認します。"
        actions={
          <Link
            href="/admin"
            className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
          >
            ダッシュボード
          </Link>
        }
        tabs={[
          { key: "all", label: "すべて", badge: total },
          { key: "attached", label: "貼付済", badge: attached },
          { key: "written", label: "書込済", badge: written },
          { key: "prepared", label: "未書込", badge: prepared },
        ]}
        activeTab={statusTab}
        onTabSelect={(k) => setStatusTab(k as typeof statusTab)}
      />

      {/* Table */}
      <section className="glass-card">
        <div className="p-5 border-b border-border-subtle">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">タグ一覧</div>
          <div className="mt-1 text-base font-semibold text-primary">タグ台帳</div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            {rows.length === 0 ? "NFCタグがまだ登録されていません。" : "この状態のタグはありません。"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-inset">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">タグコード</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">車両 / 顧客</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-muted">証明書</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-muted">UID</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-muted">
                    書込日時
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-muted">
                    貼付日時
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleRows.map((row) => {
                  const v = row.vehicle_id ? (vehicleMap[row.vehicle_id] ?? null) : null;
                  const c = row.certificate_id ? (certMap[row.certificate_id] ?? null) : null;
                  const tagMeta = tagStatusMeta(row.status);
                  const cMeta = certStatusMeta(c?.status);
                  const publicId = c?.public_id?.trim() ?? "";
                  const isRetired = row.status === "retired";
                  const isLoading = loading === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-surface-hover align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tagMeta.cls}`}
                        >
                          {tagMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.tag_code ?? "-"}</td>
                      <td className="px-4 py-3">
                        {v ? (
                          <Link
                            href={`/admin/vehicles/${row.vehicle_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {vehicleLabel(v)}
                          </Link>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                        {v?.customer_name && <div className="mt-0.5 text-xs text-muted">{v.customer_name}</div>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3">
                        {publicId ? (
                          <div className="space-y-1">
                            <Link
                              href={`/c/${publicId}`}
                              target="_blank"
                              className="font-mono text-xs text-secondary hover:underline"
                            >
                              {publicId}
                            </Link>
                            <div>
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cMeta.cls}`}
                              >
                                {cMeta.label}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-muted">{row.uid ?? "-"}</td>
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs text-muted">
                        {formatDateTime(row.written_at)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs text-muted">
                        {formatDateTime(row.attached_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {!isRetired && (
                            <button
                              onClick={() => handleRetire(row.id)}
                              disabled={isLoading}
                              className="rounded-md border border-warning/30 bg-warning-dim px-2.5 py-1 text-[11px] font-medium text-warning-text hover:bg-warning/15 disabled:opacity-50 transition-colors"
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
                                    className="rounded-md border border-border-default bg-surface px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-hover transition-colors"
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
    </div>
  );
}
