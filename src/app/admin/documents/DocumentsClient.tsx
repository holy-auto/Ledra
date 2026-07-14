"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  isDocumentDeletable,
  type DocType,
  type DocumentRow,
} from "@/types/document";
import DocumentForm from "./DocumentForm";
import ShareDocumentModal from "@/components/documents/ShareDocumentModal";
import CustomerSummaryPanel from "./CustomerSummaryPanel";
import { canConsolidateDocuments } from "@/lib/documents/consolidateEligibility";

const MAX_BULK_SHARE = 20;

type Stats = { total: number; unpaid_amount: number };
type DocumentsData = { documents: DocumentRow[]; stats: Stats };

export default function DocumentsClient({ initialTypeFilter }: { initialTypeFilter?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customer_id") ?? "";
  const prefillVehicleId = searchParams.get("vehicle_id") ?? "";
  const prefillReservationId = searchParams.get("reservation_id") ?? "";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 一括送付
  const [bulkShareOpen, setBulkShareOpen] = useState(false);

  // 合算請求書の作成
  const [creatingConsolidated, setCreatingConsolidated] = useState(false);

  // 入金記録（請求書のみ）
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [recordingPayment, setRecordingPayment] = useState(false);

  const handleFilterChange = (newType: string, newStatus: string) => {
    setTypeFilter(newType);
    setStatusFilter(newStatus);
    setActiveTypeFilter(newType);
    setActiveStatusFilter(newStatus);
    setSelectedIds(new Set());
  };

  const isDeletable = (doc: DocumentRow) => isDocumentDeletable(doc.doc_type, doc.status);
  const isSendable = (doc: DocumentRow) => !!doc.customer_id && doc.status !== "cancelled" && doc.status !== "rejected";
  const selectableDocs = docs.filter((d) => isDeletable(d) || isSendable(d));
  const allSelected = selectableDocs.length > 0 && selectableDocs.every((d) => selectedIds.has(d.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableDocs.map((d) => d.id)));
  };

  const selectedDocs = docs.filter((d) => selectedIds.has(d.id));
  const selectedDeletableCount = selectedDocs.filter(isDeletable).length;
  const selectedCustomerIds = new Set(selectedDocs.map((d) => d.customer_id).filter(Boolean));
  const canBulkSend =
    selectedDocs.length > 0 &&
    selectedDocs.every((d) => d.customer_id) &&
    selectedCustomerIds.size === 1 &&
    selectedDocs.length <= MAX_BULK_SHARE + 1;
  const bulkSendDisabledReason =
    selectedDocs.length === 0
      ? undefined
      : selectedCustomerIds.size > 1
        ? "同じ顧客の帳票のみ一括送付できます"
        : selectedDocs.length > MAX_BULK_SHARE + 1
          ? `一度に送付できるのは${MAX_BULK_SHARE + 1}件までです`
          : !selectedDocs.every((d) => d.customer_id)
            ? "顧客が未設定の帳票は送付できません"
            : undefined;

  const consolidateEligibility = canConsolidateDocuments(selectedDocs);
  const canConsolidate = consolidateEligibility.ok;
  const consolidateDisabledReason = consolidateEligibility.reason;

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
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = docs.filter((d) => selectedIds.has(d.id) && isDeletable(d)).map((d) => d.id);
    if (ids.length === 0) return;
    if (!confirm(`選択した ${ids.length} 件の帳票を削除しますか？`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSelectedIds(new Set());
      mutate();
    } catch (e: any) {
      alert("一括削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCreateConsolidated = async () => {
    if (!canConsolidate) return;
    if (!confirm(`選択した ${selectedDocs.length} 件を合算して請求書を作成しますか？`)) return;
    setCreatingConsolidated(true);
    try {
      const customerId = selectedDocs[0].customer_id;
      // 各元帳票の合計金額（税込）を1明細行として並べる。複数税率が混在する場合でも
      // ponytail: 税率区分は一律 10% で計算する（元帳票ごとの税率差異は反映しない）。
      // 混在税率を厳密に扱う場合は元帳票ごとに tax_breakdown を合算する処理へ拡張が必要。
      const items = selectedDocs.map((d) => ({
        item_type: "item",
        description: `${docTypeLabel(d.doc_type)} ${d.doc_number}`,
        quantity: 1,
        unit_price: d.total,
      }));
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc_type: "consolidated_invoice",
          customer_id: customerId,
          items,
          tax_rate: 10,
          is_tax_inclusive: true,
          status: "draft",
          source_document_id: selectedDocs[0].id,
          meta_json: { source_document_ids: selectedDocs.map((d) => d.id) },
          note: `合算対象: ${selectedDocs.map((d) => d.doc_number).join("、")}`,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSelectedIds(new Set());
      mutate();
      router.push(`/admin/documents/${j.document.id}`);
    } catch (e: any) {
      alert("合算請求書の作成に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setCreatingConsolidated(false);
    }
  };

  const docTypeLabel = (dt: string) => DOC_TYPES[dt as DocType]?.label ?? dt;

  // CustomerSummaryPanel は現在の一覧フィルタと同じ docs を受け取るため、
  // 絞り込み中であることを明示しないと「未入金額が0件」等の集計が誤解される。
  const filterScopeLabel = [
    activeTypeFilter !== "all" ? docTypeLabel(activeTypeFilter) : null,
    activeStatusFilter !== "all" ? statusLabel(activeStatusFilter) : null,
  ]
    .filter(Boolean)
    .join(" / ");

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

          {/* Aging Analysis（請求書のみ） */}
          {activeTypeFilter === "invoice" &&
            (() => {
              const unpaid = docs.filter((d) => d.status === "sent" || d.status === "overdue");
              if (unpaid.length === 0) return null;
              const now = new Date();
              const aging = { current: 0, d30: 0, d60: 0, d90: 0, currentAmt: 0, d30Amt: 0, d60Amt: 0, d90Amt: 0 };
              for (const doc of unpaid) {
                if (!doc.due_date) {
                  aging.current++;
                  aging.currentAmt += doc.total;
                  continue;
                }
                const days = Math.floor((now.getTime() - new Date(doc.due_date).getTime()) / 86400000);
                if (days <= 0) {
                  aging.current++;
                  aging.currentAmt += doc.total;
                } else if (days <= 30) {
                  aging.d30++;
                  aging.d30Amt += doc.total;
                } else if (days <= 60) {
                  aging.d60++;
                  aging.d60Amt += doc.total;
                } else {
                  aging.d90++;
                  aging.d90Amt += doc.total;
                }
              }
              return (
                <section className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <div className="glass-card p-4">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-muted">期限内</div>
                    <div className="mt-1 text-lg font-bold text-primary">{formatJpy(aging.currentAmt)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{aging.current}件</div>
                  </div>
                  <div className="glass-card p-4">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-warning-text">30日超</div>
                    <div className="mt-1 text-lg font-bold text-warning-text">{formatJpy(aging.d30Amt)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{aging.d30}件</div>
                  </div>
                  <div className="glass-card p-4">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-danger-text">60日超</div>
                    <div className="mt-1 text-lg font-bold text-danger-text">{formatJpy(aging.d60Amt)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{aging.d60}件</div>
                  </div>
                  <div className="glass-card p-4">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-danger-text">90日超</div>
                    <div className="mt-1 text-lg font-bold text-danger-text">{formatJpy(aging.d90Amt)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{aging.d90}件</div>
                  </div>
                </section>
              );
            })()}

          {/* 顧客別集計 */}
          <CustomerSummaryPanel docs={docs} filterScopeLabel={filterScopeLabel || null} />

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
              prefillVehicleId={prefillVehicleId}
              prefillReservationId={prefillReservationId}
              onSaved={(created) => {
                // 作成後はそのまま書類詳細へ遷移し、確認・編集・PDF出力へ繋げる。
                // （どの書類作成画面から来ても、作成→詳細の導線を揃える）
                setShowForm(false);
                mutate();
                router.push(`/admin/documents/${created.id}`);
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {/* Document List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5 flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">帳票一覧</div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted">{selectedIds.size} 件選択中</span>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    選択解除
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-3 py-1 text-xs"
                    disabled={!canBulkSend}
                    title={bulkSendDisabledReason}
                    onClick={() => setBulkShareOpen(true)}
                  >
                    選択した帳票を送付
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-xs"
                    disabled={!canConsolidate || creatingConsolidated}
                    title={consolidateDisabledReason}
                    onClick={handleCreateConsolidated}
                  >
                    {creatingConsolidated ? "作成中…" : "合算請求書を作成"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1 text-xs"
                    disabled={bulkDeleting || selectedDeletableCount === 0}
                    title={selectedDeletableCount === 0 ? "削除できる帳票が選択されていません" : undefined}
                    onClick={handleBulkDelete}
                  >
                    {bulkDeleting ? "削除中…" : `選択した帳票を削除 (${selectedDeletableCount})`}
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableDocs.length === 0}
                        onChange={toggleSelectAll}
                        aria-label="すべて選択"
                      />
                    </th>
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
                        {(isDeletable(doc) || isSendable(doc)) && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelected(doc.id)}
                            aria-label={`${doc.doc_number}を選択`}
                          />
                        )}
                      </td>
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
                          {doc.doc_type === "invoice" && (doc.status === "sent" || doc.status === "overdue") && (
                            <button
                              type="button"
                              className="btn-primary px-3 py-1 text-xs"
                              onClick={() => {
                                setPaymentTarget(doc.id);
                                setPaymentDate(new Date().toISOString().slice(0, 10));
                              }}
                            >
                              入金
                            </button>
                          )}
                          {isDeletable(doc) && (
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
                      <td colSpan={8} className="px-5 py-8 text-center text-muted">
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

      {/* 一括送付モーダル */}
      {bulkShareOpen && selectedDocs.length > 0 && (
        <ShareDocumentModal
          open={bulkShareOpen}
          onClose={() => setBulkShareOpen(false)}
          document={selectedDocs[0]}
          customerName={selectedDocs[0].customer_name}
          initialAdditionalDocumentIds={selectedDocs.slice(1).map((d) => d.id)}
          onShared={() => {
            setBulkShareOpen(false);
            setSelectedIds(new Set());
            mutate();
          }}
        />
      )}

      {/* Payment Dialog（請求書のみ） */}
      {paymentTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setPaymentTarget(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-primary mb-3">入金を記録</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted">入金日</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setPaymentTarget(null)} className="btn-secondary px-4 py-2 text-sm">
                戻る
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                disabled={recordingPayment}
                onClick={async () => {
                  if (recordingPayment) return;
                  setRecordingPayment(true);
                  try {
                    const res = await fetch("/api/admin/documents", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: paymentTarget, status: "paid", payment_date: paymentDate }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    setPaymentTarget(null);
                    mutate();
                  } catch (e: any) {
                    alert("入金記録に失敗しました: " + (e?.message ?? String(e)));
                  } finally {
                    setRecordingPayment(false);
                  }
                }}
              >
                {recordingPayment ? "処理中…" : "入金確定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
