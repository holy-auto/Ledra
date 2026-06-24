"use client";

import { useEffect, useState } from "react";

/**
 * LineLinkPanel（顧客ポータル）
 * ------------------------------------------------------------
 * お客様が自分で LINE 連携コードを取得するパネル。
 * 取得したコードを店舗の公式 LINE トークへ送信すると連携が完了する。
 *
 * 連携状態・店舗の LINE 対応可否は GET /api/customer/line-link で都度取得する
 * （テナント別 cookie ログインでも正しく判定でき、グローバル memberships に
 * 依存しない）。tenantSlug が変わったら state をリセットして前店舗のコードが
 * 残らないようにする。
 */
export default function LineLinkPanel({ tenantSlug }: { tenantSlug: string }) {
  const [loaded, setLoaded] = useState(false);
  const [lineEnabled, setLineEnabled] = useState(false);
  const [linked, setLinked] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // マウント時に連携状態を取得する。親側で key={tenant} を付けているため、
  // 店舗を切り替えると本コンポーネントは再マウントされ state は初期化される
  // （前店舗向けに発行したコードが残らない）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/customer/line-link?tenant=${encodeURIComponent(tenantSlug)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (cancelled) return;
        if (res.ok && j?.ok) {
          setLineEnabled(Boolean(j.lineEnabled));
          setLinked(Boolean(j.linked));
        }
      } catch {
        // 取得失敗時はパネルを出さない（loaded=true & lineEnabled=false）。
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const issue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/customer/line-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenant_slug: tenantSlug }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok || !j?.ok) {
        setErr((j?.message as string) ?? "コードの発行に失敗しました。");
        return;
      }
      setCode(j.code as string);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  // 未取得 / 店舗が LINE 未対応のときはパネルを出さない。
  if (!loaded || !lineEnabled) return null;

  if (linked) {
    return (
      <div className="mb-4 rounded-3xl border border-border-default bg-inset p-4 text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            LINE連携済み
          </span>
        </div>
        <p className="mt-1 text-secondary">この店舗の公式LINEと連携済みです。予約確認やお知らせがLINEに届きます。</p>
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-3xl border border-border-default bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-primary">LINEで予約確認・お知らせを受け取る（任意）</div>
          <div className="text-xs text-muted">店舗の公式LINEを友だち追加し、発行コードを送ると連携できます。</div>
        </div>
        <span className="text-sm text-muted">{open ? "閉じる ▲" : "設定 ▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border-default p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-secondary">
            <li>下の「連携コードを発行」を押す。</li>
            <li>店舗の公式LINEを友だち追加する。</li>
            <li>トークにコードを送信すると連携完了。</li>
          </ol>
          {code ? (
            <div className="rounded-2xl bg-inset p-3 text-center">
              <div className="text-xs text-muted">連携コード（30分有効）</div>
              <div className="font-mono text-2xl font-bold tracking-widest text-primary">{code}</div>
              <div className="mt-1 text-xs text-muted">公式LINEのトークにこのコードを送信してください。</div>
            </div>
          ) : (
            <button
              type="button"
              onClick={issue}
              disabled={loading}
              className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {loading ? "発行中…" : "連携コードを発行"}
            </button>
          )}
          {err && <div className="text-xs text-red-500">{err}</div>}
        </div>
      )}
    </div>
  );
}
