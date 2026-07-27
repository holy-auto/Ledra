"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminCommandItems, ADMIN_NAV_LABELS, CORE_HREFS, type AdminCommand } from "@/components/ui/Sidebar";
import { tokenizeQuery } from "@/lib/ai/navTokens";

/**
 * AIナビゲーション・チャット。
 * 自由文（「予約を開いて」等）を打つと、サーバの /api/admin/assistant/navigate が
 * 開くべき画面 href を返し、そこへ遷移する。AI が使えない時は静的フィルタに
 * フォールバックしてナビを止めない。
 *
 * サイドバーの入口ボタンが `open-assistant-chat` イベントで起動する。
 * 画面カタログ（ラベル/href）は adminCommandItems()（NAV_GROUPS 由来）を再利用。
 */

const CATALOG: AdminCommand[] = adminCommandItems();
// コア href は Sidebar を単一の出典として再利用（二重管理しない）。
const CORE_HREF_SET = new Set(CORE_HREFS);

/** 「こう打つとこう動く」例文。実在 href のみ表示（ラベルは逆引きで解決）。 */
const NAV_EXAMPLES: { phrase: string; href: string }[] = [
  { phrase: "予約を開いて", href: "/admin/reservations" },
  { phrase: "未読メッセージある?", href: "/admin/messages" },
  { phrase: "顧客を探したい", href: "/admin/customers" },
  { phrase: "証明書を発行", href: "/admin/certificates" },
  { phrase: "今日の作業進捗", href: "/admin/mechanic-gantt" },
  { phrase: "請求・帳票を見る", href: "/admin/invoices" },
].filter((e) => ADMIN_NAV_LABELS[e.href]);

/** 非コア画面の発見用チップ（クリックで即遷移）。長すぎないよう上限。 */
const DISCOVERY_CHIPS: AdminCommand[] = CATALOG.filter((c) => !CORE_HREF_SET.has(c.href)).slice(0, 16);

type Chip = { href: string; label: string };
type Msg = { role: "user" | "assistant"; text: string; chips?: Chip[] };

// 全文一致だと「予約を開いて」が「予約管理」に当たらない。AI 不通時のフォールバックで
// 行き止まりにしないため tokenizeQuery で軽量トークン化して substring 照合する。
function staticFilter(q: string): Chip[] {
  const query = q.toLowerCase().trim();
  const tokens = tokenizeQuery(q);
  return CATALOG.map((c) => {
    const hay = `${c.label} ${c.href}`.toLowerCase();
    let score = query && hay.includes(query) ? 10 : 0; // 全文一致は最優先
    for (const t of tokens) if (hay.includes(t)) score += 1;
    return { c, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.c.label.length - b.c.label.length)
    .slice(0, 8)
    .map((s) => ({ href: s.c.href, label: s.c.label }));
}

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // 起動: サイドバー/トップバーの入口ボタン（event）＋ グローバルショートカット ⌘/Ctrl+J。
  // 頻繁に使うため、どの管理画面からでもキー一発で開けるようにする。
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("open-assistant-chat", handleOpen);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("open-assistant-chat", handleOpen);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  // 開いたら入力にフォーカス／閉じたら会話をリセット（次に開くと使い方ヘルプが再表示される）。
  // Cmd+J トグル・Escape・背景クリックなど閉じ方に依らず必ずリセットするため open に集約する。
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // 閉じたら in-flight リクエストを中断: 遅延応答での不意の画面遷移を防ぎ、
      // loading の固着（次回開いても送信不可）も解消する。
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setMessages([]);
      setQuery("");
    }
  }, [open]);

  // 新しいメッセージで最下部へスクロール
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // 会話クリア（「使い方」ボタン用: 開いたままヘルプ表示に戻す）。閉じる時のリセットは
  // 上の open 監視 effect が担うため、close は open を倒すだけでよい。
  const reset = useCallback(() => {
    // 「使い方」でヘルプに戻す時も in-flight を中断: 古い応答が後から遷移／ヘルプを
    // 上書きするのを防ぎ、loading 固着でヘルプ例文を送信できなくなるのも解消する。
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages([]);
    setQuery("");
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const pushAssistant = useCallback((msg: Msg) => setMessages((prev) => [...prev, msg]), []);

  const fallback = useCallback(
    (q: string, aiDown: boolean) => {
      const chips = staticFilter(q);
      const text = chips.length
        ? aiDown
          ? "AIに接続できませんでした。名前が近い画面の候補です。"
          : "ぴったりの画面は見つかりませんでした。名前が近い候補です。"
        : aiDown
          ? "AIに接続できませんでした。少し待って再度お試しください。"
          : "該当する画面が見つかりませんでした。";
      pushAssistant({ role: "assistant", text, chips });
    },
    [pushAssistant],
  );

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || loading) return;
      setQuery("");
      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/admin/assistant/navigate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        // ダイアログを閉じた（=中断）後は応答を無視し、遷移も候補表示もしない。
        if (controller.signal.aborted) return;
        if (res.ok && json?.ok) {
          const href: string | null = json.href ?? null;
          // サーバが {href,label} 済みのチップを返す（画面候補・エンティティ候補の両方）。
          const chips: Chip[] = (Array.isArray(json.alternatives) ? json.alternatives : []).filter(
            (a: unknown): a is Chip =>
              !!a && typeof (a as Chip).href === "string" && typeof (a as Chip).label === "string",
          );
          if (href) {
            pushAssistant({ role: "assistant", text: json.reply || `${ADMIN_NAV_LABELS[href] ?? href} を開きます。` });
            navigate(href);
            return;
          }
          if (json.reply || chips.length) {
            // 候補が空（エンティティ0件 or 画面誤判定）の時は、名前が近い画面を静的フィルタで補い
            // 行き止まりを避ける（例「顧客管理」を検索意図と誤判定 → 顧客管理の画面を提示）。
            const finalChips = chips.length ? chips : staticFilter(q);
            pushAssistant({
              role: "assistant",
              text: json.reply || "近い画面の候補です。",
              chips: finalChips,
            });
            return;
          }
          // AI が正常応答したが一致・候補なし → 静的フィルタで補う（AIは生きている）
          fallback(q, false);
          return;
        }
        // 非 200 / plan 制限など → AI 到達不可としてフォールバック
        fallback(q, true);
      } catch {
        // 中断（ダイアログを閉じた）は無視。それ以外は AI 到達不可としてフォールバック。
        if (controller.signal.aborted) return;
        fallback(q, true);
      } finally {
        // 後続の送信に取って代わられていなければ状態を解放（中断時は close 側で解放済み）。
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [loading, navigate, pushAssistant, fallback],
  );

  if (!open) return null;

  const showHelp = messages.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border-subtle bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
          <span className="text-accent">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h8M8 14h5M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"
              />
            </svg>
          </span>
          <span className="flex-1 text-sm font-medium text-primary">AIナビ — 開きたい画面を打つ</span>
          {!showHelp && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface-hover hover:text-primary"
            >
              使い方
            </button>
          )}
          <kbd className="hidden rounded-md border border-border-subtle bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline-flex">
            ESC
          </kbd>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          {showHelp ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">こう打つと開く</div>
                <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
                  {NAV_EXAMPLES.map((ex) => (
                    <li key={ex.phrase}>
                      <button
                        type="button"
                        onClick={() => send(ex.phrase)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover"
                      >
                        <span className="flex-1 text-secondary">「{ex.phrase}」</span>
                        <span className="text-muted">→</span>
                        <span className="font-medium text-primary">{ADMIN_NAV_LABELS[ex.href]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  「田中さんの情報」「ナンバー品川300」「車体番号〇〇」「証明書
                  LD-001」などで、顧客・車両・証明書・請求書も直接探せます。
                </p>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                  その他の画面（タップで移動）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DISCOVERY_CHIPS.map((c) => (
                    <button
                      key={c.href}
                      type="button"
                      onClick={() => navigate(c.href)}
                      className="rounded-full border border-border-subtle px-2.5 py-1 text-[12px] text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${
                      m.role === "user"
                        ? "bg-accent text-inverse"
                        : "bg-[var(--bg-surface)] text-secondary shadow-[inset_0_0_0_1px_var(--border-subtle)]"
                    }`}
                  >
                    <div>{m.text}</div>
                    {m.chips && m.chips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.chips.map((c) => (
                          <button
                            key={c.href}
                            type="button"
                            onClick={() => navigate(c.href)}
                            className="rounded-full border border-border-subtle bg-[var(--bg-elevated)] px-2.5 py-1 text-[12px] text-primary transition-colors hover:bg-surface-hover"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                    考え中…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input — 頻繁に打つので大きめ・打ちやすく（text-base=16px は iOS の自動ズームも防ぐ） */}
        <form
          className="flex items-center gap-2 border-t border-border-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(query);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // 日本語IME変換確定のEnterで送信されないようガード（isComposing 中は submit を抑止）。
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
            }}
            placeholder="例: 予約を開いて / 田中さんの情報 / ナンバー品川300"
            className="h-12 flex-1 rounded-xl bg-[var(--bg-surface)] px-4 text-base text-primary placeholder:text-muted shadow-[inset_0_0_0_1px_var(--border-subtle)] outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex h-12 items-center rounded-xl bg-accent px-5 text-[15px] font-medium text-inverse transition-opacity disabled:opacity-40"
          >
            送信
          </button>
        </form>
      </div>
    </div>
  );
}
