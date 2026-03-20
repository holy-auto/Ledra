"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

/* ---------- types ---------- */
type InquiryStatus = "new" | "responded" | "in_negotiation" | "closed";

interface InquiryRow {
  id: string;
  buyer_name: string;
  buyer_company: string | null;
  maker: string;
  model: string;
  status: InquiryStatus;
  message: string;
  created_at: string;
}

interface ReplyRow {
  id: string;
  sender: string;
  body: string;
  created_at: string;
}

/* ---------- helpers ---------- */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "new", label: "新規" },
  { value: "responded", label: "返信済" },
  { value: "in_negotiation", label: "商談中" },
  { value: "closed", label: "クローズ" },
];

const statusLabel = (s: InquiryStatus): string => {
  const m: Record<InquiryStatus, string> = {
    new: "新規",
    responded: "返信済",
    in_negotiation: "商談中",
    closed: "クローズ",
  };
  return m[s] ?? s;
};

const statusVariant = (s: InquiryStatus): "default" | "success" | "warning" | "danger" | "info" => {
  const m: Record<InquiryStatus, "default" | "success" | "warning" | "danger" | "info"> = {
    new: "info",
    responded: "success",
    in_negotiation: "warning",
    closed: "default",
  };
  return m[s] ?? "default";
};

/* ---------- component ---------- */
export default function InquiriesClient() {
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");

  // Expanded inquiry
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  // Deal creation
  const [creatingDealId, setCreatingDealId] = useState<string | null>(null);

  const fetchInquiries = useCallback(async (status?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/market/inquiries?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setInquiries(j.inquiries ?? j ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchInquiries();
      setLoading(false);
    })();
  }, [fetchInquiries]);

  const applyFilter = (newStatus: string) => {
    setStatusFilter(newStatus);
    fetchInquiries(newStatus);
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setReplies([]);
      setReplyText("");
      return;
    }
    setExpandedId(id);
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/market/inquiries/${id}/reply`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setReplies(j.replies ?? j ?? []);
    } catch {
      setReplies([]);
    } finally {
      setRepliesLoading(false);
    }
  };

  const handleReply = async (inquiryId: string) => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/market/inquiries/${inquiryId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setReplyText("");
      // Refresh replies
      const rRes = await fetch(`/api/market/inquiries/${inquiryId}/reply`, { cache: "no-store" });
      const rJ = await rRes.json().catch(() => null);
      setReplies(rJ?.replies ?? rJ ?? []);
      // Refresh list
      await fetchInquiries(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("返信に失敗しました: " + msg);
    } finally {
      setReplySending(false);
    }
  };

  const handleCreateDeal = async (inquiryId: string) => {
    if (!confirm("この問い合わせから商談を作成しますか?")) return;
    setCreatingDealId(inquiryId);
    try {
      const res = await fetch("/api/market/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: inquiryId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      alert("商談を作成しました");
      await fetchInquiries(statusFilter);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("商談作成に失敗しました: " + msg);
    } finally {
      setCreatingDealId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="問い合わせ"
        title="問い合わせ管理"
        description="バイヤーからの問い合わせを管理します。"
      />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => applyFilter(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Inquiry List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">問い合わせ一覧</div>
                <div className="mt-1 text-base font-semibold text-primary">問い合わせ一覧</div>
              </div>
              <div className="text-sm text-muted">{inquiries.length} 件</div>
            </div>

            {inquiries.length === 0 && (
              <div className="glass-card p-8 text-center text-muted">
                問い合わせがありません
              </div>
            )}

            <div className="space-y-3">
              {inquiries.map((inq) => (
                <div key={inq.id} className="glass-card overflow-hidden">
                  {/* Summary row */}
                  <button
                    type="button"
                    className="w-full p-4 text-left hover:bg-surface-hover transition-colors"
                    onClick={() => toggleExpand(inq.id)}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-primary truncate">
                            {inq.buyer_name}
                            {inq.buyer_company && (
                              <span className="ml-2 text-xs font-normal text-secondary">
                                {inq.buyer_company}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-secondary mt-0.5">
                            {inq.maker} {inq.model}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant={statusVariant(inq.status)}>
                          {statusLabel(inq.status)}
                        </Badge>
                        <span className="text-xs text-muted">{formatDate(inq.created_at)}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === inq.id && (
                    <div className="border-t border-border-subtle p-4 space-y-4">
                      {/* Original message */}
                      <div>
                        <div className="text-xs text-muted mb-1">問い合わせ内容</div>
                        <div className="text-sm text-primary whitespace-pre-wrap">{inq.message}</div>
                      </div>

                      {/* Message thread */}
                      <div>
                        <div className="text-xs text-muted mb-2">メッセージスレッド</div>
                        {repliesLoading && (
                          <div className="text-xs text-muted">読み込み中...</div>
                        )}
                        {!repliesLoading && replies.length === 0 && (
                          <div className="text-xs text-muted">返信はまだありません</div>
                        )}
                        {!repliesLoading && replies.length > 0 && (
                          <div className="space-y-2">
                            {replies.map((r) => (
                              <div key={r.id} className="rounded-lg bg-surface-hover p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-secondary">{r.sender}</span>
                                  <span className="text-[10px] text-muted">{formatDate(r.created_at)}</span>
                                </div>
                                <div className="text-sm text-primary whitespace-pre-wrap">{r.body}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reply form */}
                      <div className="space-y-2">
                        <textarea
                          className="input-field w-full min-h-[80px]"
                          placeholder="返信を入力..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={replySending || !replyText.trim()}
                            onClick={() => handleReply(inq.id)}
                          >
                            {replySending ? "送信中..." : "返信する"}
                          </button>
                          {inq.status !== "closed" && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={creatingDealId === inq.id}
                              onClick={() => handleCreateDeal(inq.id)}
                            >
                              {creatingDealId === inq.id ? "作成中..." : "商談に進む"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => toggleExpand(inq.id)}
                          >
                            閉じる
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
