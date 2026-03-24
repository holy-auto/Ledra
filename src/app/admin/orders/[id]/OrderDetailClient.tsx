"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { formatJpy, formatDate } from "@/lib/format";

// ─── Types ───

type OrderStatus =
  | "pending" | "quoting" | "accepted" | "in_progress"
  | "approval_pending" | "payment_pending" | "completed"
  | "rejected" | "cancelled";

interface OrderDetail {
  id: string;
  order_number: string | null;
  from_tenant_id: string;
  to_tenant_id: string;
  title: string;
  description: string | null;
  category: string | null;
  budget: number | null;
  accepted_amount: number | null;
  deadline: string | null;
  status: OrderStatus;
  payment_method: string | null;
  payment_status: string;
  payment_confirmed_by_client: boolean;
  payment_confirmed_by_vendor: boolean;
  vendor_completed_at: string | null;
  client_approved_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

interface TenantInfo {
  id: string;
  company_name: string;
  slug: string;
}

interface DocumentInfo {
  id: string;
  doc_type: string;
  doc_number: string;
  status: string;
  total: number;
  issued_at: string;
}

interface ChatMessage {
  id: string;
  sender_tenant_id: string;
  body: string;
  is_system: boolean;
  created_at: string;
}

interface ReviewInfo {
  id: string;
  reviewer_tenant_id: string;
  reviewed_tenant_id: string;
  rating: number;
  comment: string | null;
  published_at: string | null;
}

interface AuditEntry {
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor_tenant_id: string;
  created_at: string;
}

// ─── Status helpers ───

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "申請中",
  quoting: "見積中",
  accepted: "受注済",
  in_progress: "作業中",
  approval_pending: "検収待ち",
  payment_pending: "支払待ち",
  completed: "完了",
  rejected: "辞退",
  cancelled: "取消",
};

const STATUS_VARIANTS: Record<OrderStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  quoting: "warning",
  accepted: "info",
  in_progress: "info",
  approval_pending: "warning",
  payment_pending: "warning",
  completed: "success",
  rejected: "danger",
  cancelled: "default",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  estimate: "見積書",
  delivery: "納品書",
  purchase_order: "発注書",
  order_confirmation: "発注請書",
  inspection: "検収書",
  receipt: "領収書",
  invoice: "請求書",
  consolidated_invoice: "合算請求書",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "銀行振込",
  cash: "現金",
  card: "カード",
  stripe_connect: "Stripe",
  other: "その他",
};

// ─── Next status transitions for action buttons ───

interface Transition {
  next: OrderStatus;
  label: string;
  side: "from" | "to" | "both";
  variant?: "primary" | "danger";
}

const TRANSITIONS: Record<string, Transition[]> = {
  pending: [
    { next: "accepted", label: "受注する", side: "to" },
    { next: "rejected", label: "辞退", side: "to", variant: "danger" },
    { next: "cancelled", label: "取消", side: "from", variant: "danger" },
  ],
  quoting: [
    { next: "accepted", label: "受注する", side: "to" },
    { next: "rejected", label: "辞退", side: "to", variant: "danger" },
    { next: "cancelled", label: "取消", side: "from", variant: "danger" },
  ],
  accepted: [
    { next: "in_progress", label: "作業開始", side: "to" },
    { next: "cancelled", label: "取消", side: "from", variant: "danger" },
  ],
  in_progress: [
    { next: "approval_pending", label: "施工完了報告", side: "to" },
  ],
  approval_pending: [
    { next: "payment_pending", label: "検収承認", side: "from" },
  ],
};

// ─── Component ───

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [fromTenant, setFromTenant] = useState<TenantInfo | null>(null);
  const [toTenant, setToTenant] = useState<TenantInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reviews, setReviews] = useState<ReviewInfo[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [isFrom, setIsFrom] = useState(false);
  const [isTo, setIsTo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Chat
  const [chatBody, setChatBody] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Review
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Payment confirm
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOrder(j.order);
      setFromTenant(j.from_tenant);
      setToTenant(j.to_tenant);
      setDocuments(j.documents ?? []);
      setMessages(j.recent_messages ?? []);
      setReviews(j.reviews ?? []);
      setAuditLog(j.audit_log ?? []);
      setIsFrom(j.is_from);
      setIsTo(j.is_to);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    fetchDetail().finally(() => setLoading(false));
  }, [fetchDetail]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Status update ───
  const handleStatusUpdate = async (nextStatus: string, cancelReason?: string) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: nextStatus, cancel_reason: cancelReason }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      await fetchDetail();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(false);
    }
  };

  // ─── Chat send ───
  const handleSendChat = async () => {
    if (!chatBody.trim()) return;
    setSendingChat(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: chatBody }),
      });
      if (res.ok) {
        setChatBody("");
        await fetchDetail();
      }
    } finally {
      setSendingChat(false);
    }
  };

  // ─── Review submit ───
  const handleSubmitReview = async () => {
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      await fetchDetail();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingReview(false);
    }
  };

  // ─── Payment confirm ───
  const handleConfirmPayment = async () => {
    setConfirmingPayment(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: paymentMethod }),
      });
      if (res.ok) await fetchDetail();
    } finally {
      setConfirmingPayment(false);
    }
  };

  // ─── Render ───

  if (loading) return <div className="text-sm text-muted p-8">読み込み中...</div>;
  if (err) return <div className="glass-card p-4 text-sm text-red-500">{err}</div>;
  if (!order) return <div className="text-sm text-muted p-8">注文が見つかりません</div>;

  const myRole = isFrom ? "発注者" : "受注者";
  const myAlreadyReviewed = reviews.some((r) =>
    isFrom ? r.reviewer_tenant_id === order.from_tenant_id : r.reviewer_tenant_id === order.to_tenant_id,
  );
  const availableTransitions = (TRANSITIONS[order.status] ?? []).filter((t) => {
    if (t.side === "from") return isFrom;
    if (t.side === "to") return isTo;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        tag="受発注詳細"
        title={order.title}
        description={`${order.order_number ?? ""} — ${myRole}`}
        actions={
          <Link href="/admin/orders" className="btn-secondary text-sm">
            一覧に戻る
          </Link>
        }
      />

      {/* ─── Header info ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-4">
          <div className="text-xs text-muted">ステータス</div>
          <div className="mt-1">
            <Badge variant={STATUS_VARIANTS[order.status]}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted">発注元</div>
          <div className="mt-1 text-sm font-semibold text-primary">{fromTenant?.company_name ?? "—"}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted">発注先</div>
          <div className="mt-1 text-sm font-semibold text-primary">{toTenant?.company_name ?? "—"}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted">予算 / 合意金額</div>
          <div className="mt-1 text-sm font-semibold text-primary">
            {order.accepted_amount ? formatJpy(order.accepted_amount) : order.budget ? formatJpy(order.budget) : "—"}
          </div>
        </div>
      </div>

      {/* ─── Details ─── */}
      <section className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-primary">詳細情報</h3>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {order.category && <div><span className="text-muted">カテゴリ:</span> {order.category}</div>}
          {order.deadline && <div><span className="text-muted">納期:</span> {formatDate(order.deadline)}</div>}
          <div><span className="text-muted">作成日:</span> {formatDate(order.created_at)}</div>
          {order.payment_method && (
            <div><span className="text-muted">支払方法:</span> {PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}</div>
          )}
          {order.vendor_completed_at && <div><span className="text-muted">施工完了:</span> {formatDate(order.vendor_completed_at)}</div>}
          {order.client_approved_at && <div><span className="text-muted">検収承認:</span> {formatDate(order.client_approved_at)}</div>}
        </div>
        {order.description && <p className="text-[13px] text-secondary mt-2">{order.description}</p>}
        {order.cancel_reason && <p className="text-[13px] text-red-500 mt-2">取消理由: {order.cancel_reason}</p>}
      </section>

      {/* ─── Status Actions ─── */}
      {availableTransitions.length > 0 && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">アクション</h3>
          <div className="flex gap-2 flex-wrap">
            {availableTransitions.map((t) => (
              <Button
                key={t.next}
                onClick={() => {
                  if (t.next === "cancelled") {
                    const reason = prompt("取消理由を入力してください");
                    if (reason !== null) handleStatusUpdate(t.next, reason);
                  } else {
                    handleStatusUpdate(t.next);
                  }
                }}
                loading={updating}
                disabled={updating}
                className={t.variant === "danger" ? "btn-secondary text-red-500" : ""}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ─── Payment Confirmation ─── */}
      {order.status === "payment_pending" && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">支払確認</h3>
          <div className="text-xs text-muted">
            発注者: {order.payment_confirmed_by_client ? "確認済" : "未確認"} /
            受注者: {order.payment_confirmed_by_vendor ? "確認済" : "未確認"}
          </div>
          {((isFrom && !order.payment_confirmed_by_client) || (isTo && !order.payment_confirmed_by_vendor)) && (
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted">支払方法</label>
                <select className="select-field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="bank_transfer">銀行振込</option>
                  <option value="cash">現金</option>
                  <option value="card">カード</option>
                  <option value="stripe_connect">Stripe</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <Button onClick={handleConfirmPayment} loading={confirmingPayment} disabled={confirmingPayment}>
                支払を確認する
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ─── Documents ─── */}
      {documents.length > 0 && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">関連帳票</h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
                  <span className="text-muted ml-2">#{doc.doc_number}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted">{formatJpy(doc.total)}</span>
                  <Badge variant="default">{doc.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Chat ─── */}
      <section className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-primary">チャット</h3>
        <div className="max-h-80 overflow-y-auto space-y-2 p-2 bg-surface-hover rounded">
          {messages.length === 0 && <div className="text-xs text-muted text-center py-4">メッセージはありません</div>}
          {messages.map((msg) => {
            const isMine = (isFrom && msg.sender_tenant_id === order.from_tenant_id)
                        || (isTo && msg.sender_tenant_id === order.to_tenant_id);
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-[13px] ${
                  msg.is_system
                    ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 mx-auto text-center"
                    : isMine
                      ? "bg-accent/10 text-primary"
                      : "bg-surface text-secondary"
                }`}>
                  <div>{msg.body}</div>
                  <div className="text-[10px] text-muted mt-1">{formatDate(msg.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
        {!["completed", "cancelled", "rejected"].includes(order.status) && (
          <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              value={chatBody}
              onChange={(e) => setChatBody(e.target.value)}
              placeholder="メッセージを入力..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
            />
            <Button onClick={handleSendChat} loading={sendingChat} disabled={sendingChat || !chatBody.trim()}>
              送信
            </Button>
          </div>
        )}
      </section>

      {/* ─── Reviews ─── */}
      {order.status === "completed" && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">評価</h3>
          {reviews.filter((r) => r.published_at).map((r) => (
            <div key={r.id} className="p-3 bg-surface-hover rounded text-sm">
              <div className="flex items-center gap-2">
                <span className="text-yellow-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span className="text-muted text-xs">
                  {r.reviewer_tenant_id === order.from_tenant_id ? fromTenant?.company_name : toTenant?.company_name}
                </span>
              </div>
              {r.comment && <p className="text-secondary mt-1">{r.comment}</p>}
            </div>
          ))}
          {reviews.some((r) => !r.published_at) && !myAlreadyReviewed && (
            <div className="text-xs text-muted">相手の評価送信を待っています（双方送信後に公開されます）</div>
          )}
          {!myAlreadyReviewed && (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs text-muted">この取引を評価してください</div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewRating(n)}
                    className={`text-2xl ${n <= reviewRating ? "text-yellow-500" : "text-gray-300"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className="input-field min-h-[60px] w-full"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="コメント（任意）"
              />
              <Button onClick={handleSubmitReview} loading={submittingReview} disabled={submittingReview}>
                評価を送信
              </Button>
            </div>
          )}
          {myAlreadyReviewed && reviews.every((r) => !r.published_at) && (
            <div className="text-xs text-muted">あなたの評価は送信済みです。相手の送信後に公開されます。</div>
          )}
        </section>
      )}

      {/* ─── Audit Log ─── */}
      {auditLog.length > 0 && (
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">操作履歴</h3>
          <div className="space-y-1.5">
            {auditLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-muted w-32 shrink-0">{formatDate(entry.created_at)}</span>
                <span className="text-secondary">{entry.action}</span>
                {typeof entry.old_value?.status === "string" && typeof entry.new_value?.status === "string" && (
                  <span className="text-muted">
                    {STATUS_LABELS[entry.old_value.status as OrderStatus] ?? entry.old_value.status} →{" "}
                    {STATUS_LABELS[entry.new_value.status as OrderStatus] ?? entry.new_value.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
