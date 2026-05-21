"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";

/**
 * 顧客 360° ビューの「メッセージ」タブ。
 *
 * LINE Webhook で受信した inbound と管理画面から送信した outbound を
 * 1 つのスレッドにまとめて時系列に表示する。タブを開いた瞬間に取得し、
 * 投稿フォームから即返信できる (顧客が LINE 友だちで line_user_id が
 * 紐付いている場合のみ送信可能)。
 */

type MessageRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  body: string;
  sent_by: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  line_message_id: string | null;
  line_timestamp_ms: number | null;
  created_at: string;
};

type ThreadResponse = {
  customer: { id: string; name: string; line_user_id: string | null };
  messages: MessageRow[];
  can_send: boolean;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CustomerMessagesTab({ customerId }: { customerId: string }) {
  const swrKey = `/api/admin/customers/${customerId}/messages`;
  const { data, error, isLoading, mutate } = useSWR<ThreadResponse>(swrKey, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  });

  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const canSend = data?.can_send === true;

  // 新規メッセージで最下部にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!canSend || !draft.trim() || sendBusy) return;
    setSendBusy(true);
    setSendMsg(null);
    try {
      const res = await fetch(swrKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const j = (await parseJsonSafe(res)) as { ok?: boolean; delivered?: boolean; message?: string } | null;
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.delivered === false) {
        setSendMsg(
          "送信は試みましたが LINE 配信に失敗しました。履歴には残しています (LINE 設定 / アクセストークンを確認してください)。",
        );
      }
      setDraft("");
      await mutate();
    } catch (e) {
      setSendMsg("送信に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSendBusy(false);
    }
  }, [canSend, draft, sendBusy, swrKey, mutate]);

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">MESSAGES</div>
        <div className="mt-1 text-base font-semibold text-primary">LINE スレッド</div>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          顧客から LINE で届いたメッセージと、ここから送ったメッセージが時系列で並びます。 顧客が LINE 友だち登録
          (`customers.line_user_id` 紐付け) を済ませている場合に送信できます。
        </p>
      </div>

      <div
        ref={scrollRef}
        className="px-5 py-4 space-y-3 max-h-[480px] overflow-y-auto"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && <div className="text-sm text-muted">読み込み中…</div>}
        {error && (
          <div className="text-sm text-danger">
            読み込みに失敗しました: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        {!isLoading && !error && messages.length === 0 && (
          <div className="text-sm text-muted py-8 text-center">
            まだメッセージのやり取りはありません。
            <br />
            顧客が LINE 公式アカウントを友だち追加してメッセージを送ると、ここに表示されます。
          </div>
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
                <div>{m.body}</div>
                <div
                  className={`mt-1 text-[10px] ${isOutbound ? "text-white/70" : "text-muted"} flex items-center gap-1.5`}
                >
                  <span>{formatTime(m.created_at)}</span>
                  {isOutbound && m.failed_at && (
                    <span
                      className="rounded bg-danger-dim px-1.5 py-0.5 text-[10px] text-danger-text"
                      title={m.failure_reason ?? undefined}
                    >
                      未配信
                    </span>
                  )}
                  {isOutbound && m.delivered_at && (
                    <span className="text-[10px]" aria-label="配信済">
                      ✓
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border-subtle p-4 bg-surface-hover/30">
        {!canSend && (
          <div className="mb-2 rounded-md bg-warning-dim px-3 py-2 text-xs text-warning-text">
            この顧客にはまだ LINE ユーザが紐付いていません (`customers.line_user_id` が空)。 送信するには、顧客が LINE
            公式アカウントを友だち追加して 1 度メッセージを送るか、 予約フォームの LIFF
            経由で紐付けてもらう必要があります。
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canSend ? "返信メッセージを入力…" : "送信不可 (LINE 紐付けがありません)"}
            disabled={!canSend || sendBusy}
            rows={2}
            className="flex-1 resize-none rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || sendBusy || !draft.trim()}
            className="btn-primary text-sm self-end px-4 py-2 disabled:opacity-50"
          >
            {sendBusy ? "送信中…" : "📤 送信"}
          </button>
        </div>
        {sendMsg && <p className="mt-2 text-xs text-warning">{sendMsg}</p>}
        {canSend && <p className="mt-1 text-[10px] text-muted">Cmd/Ctrl + Enter で送信</p>}
      </div>
    </section>
  );
}
