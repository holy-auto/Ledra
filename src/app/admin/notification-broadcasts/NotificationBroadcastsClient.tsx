"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NOTIFICATION_BROADCAST_STATUS_LABEL,
  NOTIFICATION_CHANNEL_LABEL,
  NOTIFICATION_SEGMENT_TYPES,
  NOTIFICATION_SEGMENT_TYPE_LABEL,
  CHANNEL_MESSAGE_MAX,
  type NotificationBroadcastStatus,
  type NotificationChannel,
  type NotificationSegmentType,
} from "@/lib/validations/notification-broadcast";

// ─── 型定義 ──────────────────────────────────────────────────────
interface SegmentJson {
  segment_type: NotificationSegmentType;
  filters?: { days?: number; maker?: string };
}
interface NotificationBroadcast {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  message_text: string;
  segment_json: SegmentJson;
  status: NotificationBroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  target_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  updated_at: string;
}

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ステータスバッジの配色 (line-broadcasts と統一)。
const STATUS_BADGE: Record<NotificationBroadcastStatus, string> = {
  draft: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  scheduled: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  sending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  sent: "bg-green-500/15 text-green-300 border-green-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

// チャネルアイコン (絵文字)。
const CHANNEL_ICON: Record<NotificationChannel, string> = {
  line: "💚",
  sms: "📱",
  email: "✉️",
  push: "🔔",
};

// 作成ダイアログで選択可能なチャネル (push は未対応)。
const SELECTABLE_CHANNELS: NotificationChannel[] = ["line", "sms", "email"];

// タブ: 全チャネル + 各チャネル。
const CHANNEL_TABS: Array<{ key: NotificationChannel | "all"; label: string }> = [
  { key: "all", label: "全チャネル" },
  { key: "line", label: "LINE" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "メール" },
];

// ─── ユーティリティ ───────────────────────────────────────────────
function segmentLabel(seg: SegmentJson): string {
  if (seg.segment_type === "no_visit_days") return `未来店 ${seg.filters?.days ?? "?"} 日以上`;
  if (seg.segment_type === "vehicle_type") return `車種: ${seg.filters?.maker ?? "?"}`;
  return "全顧客";
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function NotificationBroadcastsClient() {
  const [broadcasts, setBroadcasts] = useState<NotificationBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<NotificationChannel | "all">("all");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notification-broadcasts");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (e) {
      console.error(e);
      showToast("error", "配信の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const visible = useMemo(
    () => (tab === "all" ? broadcasts : broadcasts.filter((b) => b.channel === tab)),
    [broadcasts, tab],
  );

  const handleSend = useCallback(
    async (b: NotificationBroadcast) => {
      if (!window.confirm(`「${b.name}」を配信しますか？この操作は取り消せません。`)) return;
      setBusyId(b.id);
      try {
        const res = await fetch(`/api/admin/notification-broadcasts/${encodeURIComponent(b.id)}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "send failed");
        showToast("success", `配信しました（成功 ${data.sent_count ?? 0} / 失敗 ${data.failed_count ?? 0}）`);
        await fetchBroadcasts();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "配信に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [fetchBroadcasts, showToast],
  );

  const handleCancel = useCallback(
    async (b: NotificationBroadcast) => {
      setBusyId(b.id);
      try {
        const res = await fetch("/api/admin/notification-broadcasts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: b.id, status: "cancelled" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "cancel failed");
        }
        showToast("success", "配信をキャンセルしました");
        await fetchBroadcasts();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "キャンセルに失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [fetchBroadcasts, showToast],
  );

  return (
    <div className="mx-auto max-w-4xl pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">一斉配信</h1>
          <p className="mt-1 text-sm text-secondary">LINE・SMS・メールでセグメント配信します</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          新規配信
        </button>
      </div>

      {/* チャネルタブ */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CHANNEL_TABS.map((t) => {
          const active = tab === t.key;
          const icon = t.key === "all" ? null : CHANNEL_ICON[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-accent bg-accent-dim text-accent"
                  : "border-border-default text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              {icon && <span className="mr-1">{icon}</span>}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">配信がまだありません。「新規配信」から作成してください。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((b) => {
            const isBusy = busyId === b.id;
            const canSend = b.status === "draft" || b.status === "scheduled";
            const canCancel = b.status === "draft" || b.status === "scheduled";
            const scheduled = formatDateTime(b.scheduled_at);
            const sentAt = formatDateTime(b.sent_at);
            return (
              <div key={b.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-base" title={NOTIFICATION_CHANNEL_LABEL[b.channel]}>
                        {CHANNEL_ICON[b.channel]}
                      </span>
                      <span className="truncate font-semibold text-primary">{b.name}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[b.status]}`}
                      >
                        {NOTIFICATION_BROADCAST_STATUS_LABEL[b.status]}
                      </span>
                    </div>
                    {b.channel === "email" && b.subject && (
                      <p className="mt-1 truncate text-xs font-medium text-secondary">件名: {b.subject}</p>
                    )}
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-secondary">{b.message_text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span className="rounded-full bg-inset px-2 py-0.5">{NOTIFICATION_CHANNEL_LABEL[b.channel]}</span>
                      <span>{segmentLabel(b.segment_json)}</span>
                      {(b.status === "sent" || b.status === "failed") && (
                        <span>
                          送信 <span className="text-success">{b.sent_count ?? 0}</span> / 対象{" "}
                          <span className="text-secondary">{b.target_count ?? 0}</span>
                          {(b.failed_count ?? 0) > 0 && (
                            <>
                              {" "}
                              / 失敗 <span className="text-danger">{b.failed_count}</span>
                            </>
                          )}
                        </span>
                      )}
                      {scheduled && b.status === "scheduled" && <span>予約: {scheduled}</span>}
                      {sentAt && <span>配信: {sentAt}</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3">
                  <button
                    disabled={isBusy || !canSend}
                    onClick={() => handleSend(b)}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    {isBusy ? "処理中…" : "配信"}
                  </button>
                  {canCancel && (
                    <button
                      disabled={isBusy}
                      onClick={() => handleCancel(b)}
                      className="rounded-lg bg-inset px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規作成ダイアログ */}
      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            showToast("success", "配信を作成しました");
            await fetchBroadcasts();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 新規作成ダイアログ ───
function CreateDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("line");
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [segmentType, setSegmentType] = useState<NotificationSegmentType>("all");
  const [days, setDays] = useState("");
  const [maker, setMaker] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // チャネルに応じた本文文字数上限。
  const messageMax = CHANNEL_MESSAGE_MAX[channel];

  function buildSegment(): { ok: true; value: SegmentJson } | { ok: false; msg: string } {
    if (segmentType === "no_visit_days") {
      const d = Number(days);
      if (!Number.isInteger(d) || d < 1) return { ok: false, msg: "未来店日数は 1 以上の整数で入力してください。" };
      return { ok: true, value: { segment_type: "no_visit_days", filters: { days: d } } };
    }
    if (segmentType === "vehicle_type") {
      if (!maker.trim()) return { ok: false, msg: "車種（メーカー名）を入力してください。" };
      return { ok: true, value: { segment_type: "vehicle_type", filters: { maker: maker.trim() } } };
    }
    return { ok: true, value: { segment_type: "all" } };
  }

  async function submit() {
    if (!name.trim()) {
      onError("配信名を入力してください。");
      return;
    }
    if (channel === "email" && !subject.trim()) {
      onError("メール配信には件名が必要です。");
      return;
    }
    if (!messageText.trim()) {
      onError("メッセージ本文を入力してください。");
      return;
    }
    if (messageText.length > messageMax) {
      onError(`${NOTIFICATION_CHANNEL_LABEL[channel]}は ${messageMax} 文字以内で入力してください。`);
      return;
    }
    const seg = buildSegment();
    if (!seg.ok) {
      onError(seg.msg);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/notification-broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          subject: channel === "email" ? subject.trim() : null,
          message_text: messageText.trim(),
          segment_json: seg.value,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = messageMax - messageText.length;

  return (
    <DialogShell title="新規配信" onClose={onClose}>
      <div className="space-y-4">
        <Field label="配信名" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 6月キャンペーン告知"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <Field label="配信チャネル" required>
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_CHANNELS.map((c) => {
              const active = channel === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-accent bg-accent-dim text-accent"
                      : "border-border-default text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <span>{CHANNEL_ICON[c]}</span>
                  {NOTIFICATION_CHANNEL_LABEL[c]}
                </button>
              );
            })}
          </div>
        </Field>

        {channel === "email" && (
          <Field label="件名" required>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, 200))}
              placeholder="例: 【6月限定】コーティングキャンペーンのお知らせ"
              className={`w-full ${inputCls}`}
            />
          </Field>
        )}

        <Field label="メッセージ本文" required>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value.slice(0, messageMax))}
            rows={channel === "email" ? 7 : 5}
            placeholder="配信する本文を入力してください"
            className={`w-full resize-none ${inputCls}`}
          />
          <div className={`mt-1 text-right text-[11px] ${remaining < 0 ? "text-danger" : "text-muted"}`}>
            残り {remaining} 文字（{NOTIFICATION_CHANNEL_LABEL[channel]}上限 {messageMax}）
          </div>
        </Field>

        <Field label="配信対象セグメント">
          <select
            value={segmentType}
            onChange={(e) => setSegmentType(e.target.value as NotificationSegmentType)}
            className={`w-full ${inputCls}`}
          >
            {NOTIFICATION_SEGMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTIFICATION_SEGMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        {segmentType === "no_visit_days" && (
          <Field label="未来店日数（N日以上）" required>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="例: 90"
              className={`w-full ${inputCls}`}
            />
          </Field>
        )}

        {segmentType === "vehicle_type" && (
          <Field label="車種（メーカー名）" required>
            <input
              value={maker}
              onChange={(e) => setMaker(e.target.value)}
              placeholder="例: トヨタ"
              className={`w-full ${inputCls}`}
            />
          </Field>
        )}

        <Field label="予約配信日時（任意）">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={`w-full ${inputCls}`}
          />
          <p className="mt-1 text-[11px] text-muted">
            指定すると「予約済み」で作成します（自動配信ではなく、配信ボタンで送信します）。
          </p>
        </Field>
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="作成する" />
    </DialogShell>
  );
}

// ─── 共通ダイアログパーツ ───
function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function DialogActions({
  onClose,
  onSubmit,
  submitting,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "処理中…" : submitLabel}
      </button>
    </div>
  );
}
