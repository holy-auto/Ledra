"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import MessageBubbleBody from "@/app/admin/messages/MessageBubbleBody";
import { ExtractedCandidateCard, type ExtractedResult } from "@/components/messages/ExtractedCandidateCard";

/**
 * 横断的な LINE 会話受信箱 (/admin/messages)。
 *
 * 左ペイン: 全顧客のスレッド一覧 (最新順 / 未読バッジ)。
 * 右ペイン: 選択スレッドの会話 + 返信フォーム。
 *
 * 既存の顧客別タブ (CustomerMessagesTab) と同じ送受信 API 流儀だが、
 * customer 未紐付け (line_user_id だけ) のスレッドも扱える。
 */

type ThreadSummary = {
  thread_key: string;
  customer_id: string | null;
  line_user_id: string | null;
  email_from: string | null;
  customer_name: string | null;
  channel: string;
  last_body: string;
  last_direction: "inbound" | "outbound";
  last_created_at: string;
  unread_count: number;
  message_count: number;
  candidate_count: number;
};

type ThreadListResponse = {
  threads: ThreadSummary[];
  total_unread: number;
  truncated: boolean;
};

type MessageRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  direction: "inbound" | "outbound";
  body: string;
  read_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  attachment_url?: string | null;
  attachment_content_type?: string | null;
  failure_reason: string | null;
  created_at: string;
  ai_extracted?: ExtractedResult | null;
};

type ThreadDetail = {
  thread: {
    key: string;
    customer_id: string | null;
    line_user_id: string | null;
    email_from: string | null;
    name: string | null;
  };
  messages: MessageRow[];
  can_send: boolean;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function threadLabel(t: ThreadSummary): string {
  if (t.customer_name) return t.customer_name;
  if (t.customer_id) return "(名前未設定の顧客)";
  if (t.email_from) return t.email_from;
  return `LINEユーザー ${t.line_user_id ? t.line_user_id.slice(0, 8) + "…" : "(不明)"}`;
}

export default function MessagesInboxClient() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const listKey = `/api/admin/messages${unreadOnly ? "?unread=true" : ""}`;
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<ThreadListResponse>(listKey, fetcher, { refreshInterval: 30_000, revalidateOnFocus: true });

  const threads = useMemo(() => listData?.threads ?? [], [listData]);
  // 通知ベルなどから ?thread=c:<id> / l:<lineUserId> で特定スレッドを開ける。
  const initialThread = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("thread");
  }, []);
  const [activeKey, setActiveKey] = useState<string | null>(initialThread);

  // 初回ロード時、未選択なら先頭スレッドを自動選択。
  useEffect(() => {
    if (!activeKey && threads.length > 0) setActiveKey(threads[0].thread_key);
  }, [threads, activeKey]);

  const detailKey = activeKey ? `/api/admin/messages/${encodeURIComponent(activeKey)}` : null;
  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<ThreadDetail>(detailKey, fetcher, { refreshInterval: 15_000, revalidateOnFocus: true });

  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // 引き継ぎ用の会話要約 (読むだけ / 送信はしない)。key はどのスレッドの要約かを保持し、
  // スレッドを切り替えたら (key 不一致で) 表示しない — 混同防止のリセット用エフェクトを避ける。
  const [summary, setSummary] = useState<{ key: string; text: string; nextAction: string | null } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => detail?.messages ?? [], [detail]);
  const canSend = detail?.can_send === true;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeKey]);

  // スレッドを開いたら既読化 (PATCH) → 一覧の未読バッジを更新。
  const markRead = useCallback(
    async (key: string) => {
      try {
        await fetch(`/api/admin/messages/${encodeURIComponent(key)}`, { method: "PATCH" });
        await mutateList();
      } catch {
        // 既読化失敗は致命的でないので無視
      }
    },
    [mutateList],
  );

  useEffect(() => {
    if (!activeKey) return;
    const t = threads.find((x) => x.thread_key === activeKey);
    if (t && t.unread_count > 0) void markRead(activeKey);
  }, [activeKey, threads, markRead]);

  // AI 抽出候補を「対応済み」にする (候補バッジ/CTA を収束)。
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const dismissCandidate = useCallback(
    async (messageId: string) => {
      setDismissingId(messageId);
      try {
        await fetch(`/api/admin/customer-messages/${encodeURIComponent(messageId)}/candidate-dismiss`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handled: true }),
        });
        await Promise.all([mutateDetail(), mutateList()]);
      } catch {
        // 収束失敗は致命的でないので無視
      } finally {
        setDismissingId(null);
      }
    },
    [mutateDetail, mutateList],
  );

  const handleSend = useCallback(async () => {
    if (!activeKey || !canSend || !draft.trim() || sendBusy) return;
    setSendBusy(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(activeKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const j = (await parseJsonSafe(res)) as { ok?: boolean; delivered?: boolean; message?: string } | null;
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.delivered === false) {
        setSendMsg("送信は試みましたが LINE 配信に失敗しました。履歴には残しています (LINE 設定を確認してください)。");
      }
      setDraft("");
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (e) {
      setSendMsg("送信に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSendBusy(false);
    }
  }, [activeKey, canSend, draft, sendBusy, mutateDetail, mutateList]);

  const handleSendImage = useCallback(
    async (file: File) => {
      if (!activeKey || !canSend || sendBusy) return;
      setSendBusy(true);
      setSendMsg(null);
      try {
        const form = new FormData();
        form.append("image", file);
        const res = await fetch(`/api/admin/messages/${encodeURIComponent(activeKey)}`, {
          method: "POST",
          body: form,
        });
        const j = (await parseJsonSafe(res)) as { ok?: boolean; delivered?: boolean; message?: string } | null;
        if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
        if (j?.delivered === false) {
          setSendMsg(
            "送信は試みましたが LINE 配信に失敗しました。履歴には残しています (LINE 設定を確認してください)。",
          );
        }
        await Promise.all([mutateDetail(), mutateList()]);
      } catch (e) {
        setSendMsg("画像の送信に失敗しました: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        setSendBusy(false);
        if (imageInputRef.current) imageInputRef.current.value = "";
      }
    },
    [activeKey, canSend, sendBusy, mutateDetail, mutateList],
  );

  // AI 返信ドラフト: 生成結果を入力欄に流し込む (送信はしない / 人が編集して送る)。
  const handleAiDraft = useCallback(async () => {
    if (!activeKey || aiBusy) return;
    setAiBusy(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(activeKey)}/ai-reply`, { method: "POST" });
      const j = (await parseJsonSafe(res)) as { ai_disabled?: boolean; draft?: string | null; message?: string } | null;
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.ai_disabled) {
        setSendMsg("AI 自動入力が無効です (設定 → AI 自動入力 で有効化できます)。");
      } else if (j?.draft) {
        setDraft(j.draft);
      } else {
        setSendMsg("返信ドラフトを生成できませんでした (直近の受信メッセージが必要です)。");
      }
    } catch (e) {
      setSendMsg("AI ドラフト生成に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAiBusy(false);
    }
  }, [activeKey, aiBusy]);

  // 引き継ぎ用の会話要約を生成して表示する (送信はしない)。
  const handleSummary = useCallback(async () => {
    if (!activeKey || summaryBusy) return;
    setSummaryBusy(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(activeKey)}/ai-summary`, { method: "POST" });
      const j = (await parseJsonSafe(res)) as {
        ai_disabled?: boolean;
        summary?: string | null;
        next_action?: string | null;
        message?: string;
      } | null;
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.ai_disabled) {
        setSendMsg("AI 自動入力が無効です (設定 → AI 自動入力 で有効化できます)。");
      } else if (j?.summary) {
        setSummary({ key: activeKey, text: j.summary, nextAction: j.next_action ?? null });
      } else {
        // 要約 null は AI 側の一時不調が主因 (会話が無いときはボタン自体が無効)。
        setSendMsg("要約を生成できませんでした。時間をおいて再度お試しください。");
      }
    } catch (e) {
      setSendMsg("AI 要約に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSummaryBusy(false);
    }
  }, [activeKey, summaryBusy]);

  return (
    <div className="space-y-4">
      <PageHeader
        tag="メッセージ"
        title="メッセージ受信箱"
        description="LINE で届いた全顧客のメッセージを一覧し、その場で返信できます。"
        actions={
          <Link href="/admin/line-broadcasts" className="btn-secondary text-sm">
            LINE一斉配信
          </Link>
        }
        tabs={[
          { key: "all", label: "すべて" },
          { key: "unread", label: "未読", badge: listData?.total_unread ?? 0 },
        ]}
        activeTab={unreadOnly ? "unread" : "all"}
        onTabSelect={(k) => setUnreadOnly(k === "unread")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* ── 左: スレッド一覧 ── */}
        <aside className="glass-card overflow-hidden">
          <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold tracking-[0.18em] text-muted">
            スレッド ({threads.length})
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-border-subtle">
            {listLoading && <div className="px-4 py-6 text-sm text-muted">読み込み中…</div>}
            {listError && (
              <div className="px-4 py-6 text-sm text-danger">
                読み込みに失敗しました: {listError instanceof Error ? listError.message : String(listError)}
              </div>
            )}
            {!listLoading && !listError && threads.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted">
                {unreadOnly ? "未読のスレッドはありません。" : "まだメッセージはありません。"}
              </div>
            )}
            {threads.map((t) => {
              const active = t.thread_key === activeKey;
              return (
                <button
                  key={t.thread_key}
                  onClick={() => setActiveKey(t.thread_key)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active ? "bg-accent/10" : "hover:bg-surface-hover/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-primary">{threadLabel(t)}</span>
                    {t.unread_count > 0 && (
                      <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="shrink-0">{t.last_direction === "outbound" ? "↪︎" : "←"}</span>
                    <span className="truncate">{t.last_body}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-muted">{formatTime(t.last_created_at)}</span>
                    {t.candidate_count > 0 && (
                      <span
                        className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                        title="AI が抽出した予定候補があります（未確認）"
                      >
                        ✨ 予定候補{t.candidate_count > 1 ? ` ${t.candidate_count}` : ""}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {listData?.truncated && (
            <div className="border-t border-border-subtle px-4 py-2 text-[10px] text-muted">表示は直近分のみです。</div>
          )}
        </aside>

        {/* ── 右: 会話 ── */}
        <section className="glass-card flex flex-col overflow-hidden">
          {!activeKey ? (
            <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted">
              左からスレッドを選択してください。
            </div>
          ) : (
            <>
              <div className="relative border-b border-border-subtle px-5 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-primary">
                    {detail?.thread.name ??
                      (detail?.thread.customer_id
                        ? "(名前未設定の顧客)"
                        : detail?.thread.email_from
                          ? detail.thread.email_from
                          : "LINEユーザー")}
                  </div>
                  {detail?.thread.line_user_id && (
                    <div className="truncate text-[10px] text-muted">LINE: {detail.thread.line_user_id}</div>
                  )}
                  {detail?.thread.email_from && !detail?.thread.line_user_id && (
                    <div className="truncate text-[10px] text-muted">メール: {detail.thread.email_from}</div>
                  )}
                </div>
                {detail?.thread.customer_id ? (
                  <Link
                    href={`/admin/customers/${detail.thread.customer_id}`}
                    className="btn-secondary text-xs shrink-0"
                  >
                    顧客ページ →
                  </Link>
                ) : (
                  detail?.thread.line_user_id && (
                    <LinkCustomerControl
                      threadKey={activeKey}
                      onLinked={async (newKey) => {
                        await Promise.all([mutateDetail(), mutateList()]);
                        setActiveKey(newKey);
                      }}
                    />
                  )
                )}
              </div>

              <div
                ref={scrollRef}
                className="flex-1 px-5 py-4 space-y-3 max-h-[520px] overflow-y-auto"
                aria-live="polite"
              >
                {detailLoading && <div className="text-sm text-muted">読み込み中…</div>}
                {detailError && (
                  <div className="text-sm text-danger">
                    読み込みに失敗しました: {detailError instanceof Error ? detailError.message : String(detailError)}
                  </div>
                )}
                {!detailLoading && !detailError && messages.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted">メッセージはありません。</div>
                )}
                {messages.map((m) => {
                  const isOutbound = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          isOutbound
                            ? "bg-accent text-white rounded-tr-sm"
                            : "bg-surface-hover text-primary rounded-tl-sm border border-border-subtle"
                        }`}
                      >
                        <MessageBubbleBody
                          body={m.body}
                          attachmentUrl={m.attachment_url}
                          attachmentContentType={m.attachment_content_type}
                        />
                        <div
                          className={`mt-1 flex items-center gap-1.5 text-[10px] ${
                            isOutbound ? "text-white/70" : "text-muted"
                          }`}
                        >
                          <span>{formatTime(m.created_at)}</span>
                          {isOutbound && m.failed_at && (
                            <span
                              className="rounded bg-danger-dim px-1.5 py-0.5 text-danger-text"
                              title={m.failure_reason ?? undefined}
                            >
                              未配信
                            </span>
                          )}
                          {isOutbound && m.delivered_at && <span aria-label="配信済">✓</span>}
                        </div>
                        {!isOutbound && m.ai_extracted && (
                          <ExtractedCandidateCard
                            result={m.ai_extracted as ExtractedResult}
                            customerId={detail?.thread.customer_id ?? undefined}
                            onDismiss={() => void dismissCandidate(m.id)}
                            dismissing={dismissingId === m.id}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border-subtle p-4 bg-surface-hover/30">
                {!canSend && (
                  <div className="mb-2 rounded-md bg-warning-dim px-3 py-2 text-xs text-warning-text">
                    このスレッドには LINE ユーザが紐付いていないため送信できません。
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={canSend ? "返信メッセージを入力…" : "送信不可"}
                    disabled={!canSend || sendBusy}
                    rows={2}
                    className="flex-1 resize-none rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <div className="flex flex-col gap-2 self-end">
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!canSend || sendBusy || !draft.trim()}
                      className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {sendBusy ? "送信中…" : "📤 送信"}
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleSendImage(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={!canSend || sendBusy}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                      title="JPEG / PNG (10MBまで) をLINEで送信"
                    >
                      📷 画像
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAiDraft()}
                      disabled={aiBusy || messages.length === 0}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                      title="直近のやり取りから返信文を AI が下書きします (送信は手動)"
                    >
                      {aiBusy ? "生成中…" : "✨ AI下書き"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSummary()}
                      disabled={summaryBusy || messages.length === 0}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                      title="担当外でも把握できるよう、会話の用件・経緯・次の一手を AI が要約します (送信しません)"
                    >
                      {summaryBusy ? "要約中…" : "🧾 会話を要約"}
                    </button>
                  </div>
                </div>
                {sendMsg && <p className="mt-2 text-xs text-warning">{sendMsg}</p>}
                {summary && summary.key === activeKey && (
                  <div className="mt-2 rounded-md border border-default bg-subtle p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-secondary">🧾 会話の要約（引き継ぎ用・社内メモ）</span>
                      <button
                        type="button"
                        onClick={() => setSummary(null)}
                        className="text-[10px] text-muted hover:text-secondary"
                      >
                        閉じる
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-primary">{summary.text}</p>
                    {summary.nextAction && (
                      <p className="mt-2 text-secondary">
                        <span className="font-semibold">次の一手:</span> {summary.nextAction}
                      </p>
                    )}
                  </div>
                )}
                {canSend && <p className="mt-1 text-[10px] text-muted">Cmd/Ctrl + Enter で送信</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 未紐付け LINE スレッドを顧客に紐付けるコントロール                   */
/* ------------------------------------------------------------------ */

type CustomerHit = { id: string; name: string; phone: string | null };

function LinkCustomerControl({
  threadKey,
  onLinked,
}: {
  threadKey: string;
  onLinked: (newThreadKey: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`);
      const j = (await parseJsonSafe(res)) as { customers?: CustomerHit[] } | null;
      setHits((j?.customers ?? []).slice(0, 8));
    } catch {
      setHits([]);
    }
  }, []);

  const doLink = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch(`/api/admin/messages/${encodeURIComponent(threadKey)}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await parseJsonSafe(res)) as { ok?: boolean; thread_key?: string; message?: string } | null;
        if (!res.ok || !j?.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
        setOpen(false);
        setNewName("");
        setNewPhone("");
        setSearch("");
        setHits([]);
        await onLinked(j.thread_key ?? threadKey);
      } catch (e) {
        setMsg("紐付けに失敗しました: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        setBusy(false);
      }
    },
    [threadKey, onLinked],
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs shrink-0">
        🔗 顧客に紐付け
      </button>
    );
  }

  return (
    <div className="absolute right-4 top-14 z-10 w-72 rounded-lg border border-border-default bg-surface p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">顧客に紐付け</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-primary">
          ✕
        </button>
      </div>
      <div className="mb-2 flex gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`flex-1 rounded px-2 py-1 ${mode === "new" ? "bg-accent text-white" : "bg-surface-hover text-secondary"}`}
        >
          新規作成
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`flex-1 rounded px-2 py-1 ${mode === "existing" ? "bg-accent text-white" : "bg-surface-hover text-secondary"}`}
        >
          既存から選ぶ
        </button>
      </div>

      {mode === "new" ? (
        <div className="space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="顧客名 (必須)"
            className="w-full rounded border border-border-default bg-surface px-2 py-1.5 text-xs"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="電話番号 (任意)"
            className="w-full rounded border border-border-default bg-surface px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy || !newName.trim()}
            onClick={() => void doLink({ mode: "new", name: newName.trim(), phone: newPhone.trim() || null })}
            className="btn-primary w-full px-2 py-1.5 text-xs disabled:opacity-50"
          >
            {busy ? "作成中…" : "作成して紐付け"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void runSearch(e.target.value);
            }}
            placeholder="名前 / 電話 / メールで検索"
            className="w-full rounded border border-border-default bg-surface px-2 py-1.5 text-xs"
          />
          <div className="max-h-40 overflow-y-auto divide-y divide-border-subtle">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={busy}
                onClick={() => void doLink({ mode: "existing", customer_id: h.id })}
                className="block w-full px-1 py-1.5 text-left text-xs hover:bg-surface-hover/60 disabled:opacity-50"
              >
                <span className="font-medium text-primary">{h.name}</span>
                {h.phone && <span className="ml-2 text-muted">{h.phone}</span>}
              </button>
            ))}
            {search.trim() && hits.length === 0 && (
              <div className="px-1 py-2 text-[11px] text-muted">該当する顧客が見つかりません。</div>
            )}
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}
    </div>
  );
}
