"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import {
  DOC_TYPES,
  DOC_TYPE_LIST,
  STATUS_OPTIONS,
  statusLabel,
  statusVariant,
  type DocType,
  type DocumentRow,
} from "@/types/document";
import DocumentForm from "./DocumentForm";

type Stats = { total: number; unpaid_amount: number };
type DocumentsData = { documents: DocumentRow[]; stats: Stats };

export default function DocumentsClient({ initialTypeFilter }: { initialTypeFilter?: string } = {}) {
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customer_id") ?? "";
  const autoOpenForm = searchParams.get("create") === "1";

  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>(initialTypeFilter ?? "all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("all");

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeTypeFilter && activeTypeFilter !== "all") params.set("doc_type", activeTypeFilter);
    if (activeStatusFilter && activeStatusFilter !== "all") params.set("status", activeStatusFilter);
    return `/api/admin/documents?${params.toString()}`;
  })();

  const {
    data: swrData,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<DocumentsData>(swrKey, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const docs = swrData?.documents ?? [];
  const stats = swrData?.stats ?? { total: 0, unpaid_amount: 0 };
  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  const [showForm, setShowForm] = useState(autoOpenForm);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFilterChange = (newType: string, newStatus: string) => {
    setTypeFilter(newType);
    setStatusFilter(newStatus);
    setActiveTypeFilter(newType);
    setActiveStatusFilter(newStatus);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この帳票を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  const docTypeLabel = (dt: string) => DOC_TYPES[dt as DocType]?.label ?? dt;

  const defaultDocType: DocType =
    initialTypeFilter && initialTypeFilter in DOC_TYPES ? (initialTypeFilter as DocType) : "estimate";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="帳票"
        title="帳票管理"
        description="見積書・納品書・請求書・領収書などの作成・管理を行います。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm(!showForm);
              setSaveMsg(null);
            }}
          >
            {showForm ? "閉じる" : "新規作成"}
          </button>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {swrData && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.total}</div>
              <div className="mt-1 text-xs text-muted">総帳票数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">未入金</div>
              <div className="mt-2 text-2xl font-bold text-primary">{formatJpy(stats.unpaid_amount)}</div>
              <div className="mt-1 text-xs text-muted">未入金額</div>
            </div>
          </section>

          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">書類種別</label>
                <select
                  className="select-field"
                  value={typeFilter}
                  onChange={(e) => handleFilterChange(e.target.value, statusFilter)}
                >
                  <option value="all">すべて</option>
                  {DOC_TYPE_LIST.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(typeFilter, e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>}

          {/* Create Form */}
          {showForm && (
            <DocumentForm
              mode="create"
              defaultDocType={defaultDocType}
              prefillCustomerId={prefillCustomerId}
              onSaved={(created) => {
                setShowForm(false);
                const docLabel = DOC_TYPES[created.doc_type as DocType]?.label ?? created.doc_type;
                setSaveMsg({ text: `${docLabel} ${created.doc_number} を作成しました`, ok: true });
                mutate();
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {/* Document List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">帳票一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">種別</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">書類番号</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      顧客名
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      発行日
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      ステータス
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Badge variant={DOC_TYPES[doc.doc_type]?.color ?? "default"}>
                          {docTypeLabel(doc.doc_type)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/documents/${doc.id}`}
                          className="font-mono text-accent hover:text-accent underline"
                        >
                          {doc.doc_number}
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5 text-secondary">
                        {doc.recipient_name || doc.customer_name || "-"}
                      </td>
                      <td className="hidden md:table-cell px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(doc.issued_at)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-primary">{formatJpy(doc.total)}</td>
                      <td className="hidden sm:table-cell px-5 py-3.5">
                        <Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Link href={`/admin/documents/${doc.id}`} className="btn-ghost px-3 py-1 text-xs">
                            詳細
                          </Link>
                          {doc.status === "draft" && (
                            <button
                              type="button"
                              className="btn-danger px-3 py-1 text-xs"
                              disabled={deletingId === doc.id}
                              onClick={() => handleDelete(doc.id)}
                            >
                              {deletingId === doc.id ? "削除中…" : "削除"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted">
                        帳票がありません
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
