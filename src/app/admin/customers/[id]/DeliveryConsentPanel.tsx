"use client";

import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

/**
 * 電子交付の事前承諾（G3）とその撤回（G4）の記録パネル。 [第２ ４（３）（４）]
 *
 * 記録簿の写し（証明書）を電磁的方法で交付する前に、使用者の承諾を取得・記録する。撤回されると
 * 受領サイン依頼（電子交付）がブロックされる。見積/請求の送付（documents/share）は対象外。
 */

type ConsentState = "none" | "granted" | "revoked";
type ConsentRow = {
  status: "granted" | "revoked";
  method: string | null;
  granted_at: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_via: string | null;
  note: string | null;
} | null;

const LABEL: Record<ConsentState, string> = {
  none: "未承諾",
  granted: "承諾済み",
  revoked: "撤回済み（電子交付不可）",
};

// 店舗の記録・撤回・記録の取り消しは、押し間違えると承諾の状態がそのまま変わるので必ず確認を挟む。
const ACTIONS = {
  record: {
    method: "POST",
    query: "",
    confirm:
      "お客様から書面・口頭で承諾を得ましたか？\n「店舗が記録した承諾」として保存します（お客様ご自身の操作の記録にはなりません）。\nお客様に承諾していただく場合は「お客様に承諾をお願いする」を使ってください。",
    done: "承諾を記録しました。",
  },
  revoke: {
    method: "DELETE",
    query: "",
    confirm: "お客様から撤回の申し出がありましたか？\n撤回すると、電子交付（受領サイン依頼など）はできなくなります。",
    done: "撤回を記録しました。",
  },
  cancelRecord: {
    method: "DELETE",
    query: "?mode=cancel_record",
    confirm:
      "店舗が記録した承諾を取り消して、押す前の状態（未承諾、または以前の撤回）に戻します。取り消した事実は操作ログに残ります。よろしいですか？",
    done: "店舗の記録を取り消し、押す前の状態に戻しました。",
  },
} as const;

export default function DeliveryConsentPanel({ customerId }: { customerId: string }) {
  const [state, setState] = useState<ConsentState>("none");
  const [row, setRow] = useState<ConsentRow>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/delivery-consent`);
      const j = await parseJsonSafe(res);
      if (res.ok) {
        setState((j?.status as ConsentState) ?? "none");
        setRow((j?.consent as ConsentRow) ?? null);
      } else {
        // 取得失敗を「未承諾」と誤表示しない（実際は granted/revoked かもしれない）。
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: keyof typeof ACTIONS) {
    const a = ACTIONS[kind];
    if (!window.confirm(a.confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/delivery-consent${a.query}`, {
        method: a.method,
        headers: { "content-type": "application/json" },
        body: a.method === "POST" ? JSON.stringify({ method: "メール/LINE/SMS/ダウンロード" }) : undefined,
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? "処理に失敗しました。");
      setMsg({ text: a.done, ok: true });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "処理に失敗しました。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  // 承諾のお願い（お客様が自分の端末で承諾するリンク）。店頭なら QR を読んでもらう。
  const [request, setRequest] = useState<{ url: string; qr: string; expiresAt: string } | null>(null);

  async function requestConsent(send: "link" | "email" | "line") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/delivery-consent/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ send }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? "リンクを作成できませんでした。");
      // メール・LINE で届いたときは URL が返らない（店舗の画面にリンクを残さない）。
      if (typeof j?.url === "string") {
        const QRCode = (await import("qrcode")).default;
        setRequest({
          url: j.url,
          qr: await QRCode.toDataURL(j.url, { margin: 1, width: 200 }),
          expiresAt: String(j.expires_at),
        });
      } else {
        setRequest(null);
      }
      if (send !== "link") {
        setMsg(
          j.delivered
            ? { text: send === "email" ? "メールで送りました。" : "LINE で送りました。", ok: true }
            : { text: "送信できませんでした。下のリンクを別の方法でお渡しください。", ok: false },
        );
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "リンクを作成できませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const badgeClass =
    state === "granted"
      ? "bg-success/10 text-success-text"
      : state === "revoked"
        ? "bg-danger/10 text-danger-text"
        : "bg-surface text-muted";

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">電子交付の承諾</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${loadError ? "bg-danger/10 text-danger-text" : badgeClass}`}
        >
          {loading ? "読み込み中…" : loadError ? "状態を取得できません" : LABEL[state]}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        記録簿の写し（証明書）を電子的に交付する前の事前承諾です。撤回されると電子交付（受領サイン依頼）は
        行えません。見積書・請求書の送付には影響しません。
      </p>
      {row?.status === "granted" && row.granted_at && (
        <p className="mt-1 text-[11px] text-muted">
          承諾: {new Date(row.granted_at).toLocaleString("ja-JP")}（
          {/* 店舗の記録は必ず granted_by=操作者。本人のポータル承諾だけが granted_by=null */}
          {row.granted_by ? "店舗が記録" : "お客様本人"}）
        </p>
      )}
      {row?.status === "revoked" && row.revoked_at && (
        <p className="mt-1 text-[11px] text-danger-text">
          撤回: {new Date(row.revoked_at).toLocaleString("ja-JP")}（
          {row.revoked_via === "customer" ? "お客様本人" : "店舗"}）
        </p>
      )}
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? "text-success-text" : "text-danger-text"}`}>{msg.text}</p>}
      {state !== "granted" && !loading && !loadError && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-primary">お客様に承諾をお願いする</div>
          <p className="mt-1 text-[11px] text-muted">
            お客様ご自身の端末で説明を読んで承諾していただくリンクを作ります（14日間・1回限り）。店頭では QR
            を読んでもらってください。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => requestConsent("link")}
              disabled={busy}
              className="btn-primary text-xs disabled:opacity-50"
            >
              リンクと QR を作る
            </button>
            <button
              type="button"
              onClick={() => requestConsent("email")}
              disabled={busy}
              className="btn-secondary text-xs disabled:opacity-50"
            >
              メールで送る
            </button>
            <button
              type="button"
              onClick={() => requestConsent("line")}
              disabled={busy}
              className="btn-secondary text-xs disabled:opacity-50"
            >
              LINE で送る
            </button>
          </div>
          {request && (
            <div className="mt-2 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL の QR */}
              <img
                src={request.qr}
                alt="承諾のお願いのリンク（QR コード）"
                className="h-28 w-28 rounded bg-white p-1"
              />
              <div className="min-w-0 text-[11px] text-muted">
                <div className="break-all text-primary">{request.url}</div>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(request.url)}
                  className="mt-1 underline"
                >
                  リンクをコピー
                </button>
                <div className="mt-1">有効期限: {new Date(request.expiresAt).toLocaleString("ja-JP")}</div>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && !loadError && (
        <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {state !== "granted" && (
              <button
                type="button"
                onClick={() => act("record")}
                disabled={busy}
                className="underline disabled:opacity-50"
              >
                書面・口頭で承諾を得た（店舗として記録）
              </button>
            )}
            {row?.status === "granted" && row.granted_by && (
              // 押し間違えた店舗の記録を「撤回」と区別して戻せるように。お客様本人の承諾は店舗からは取り消せない。
              <button
                type="button"
                onClick={() => act("cancelRecord")}
                disabled={busy}
                className="underline disabled:opacity-50"
              >
                店舗の記録を取り消す（押す前に戻す）
              </button>
            )}
            {state !== "revoked" && (
              <button
                type="button"
                onClick={() => act("revoke")}
                disabled={busy}
                className="text-danger-text underline disabled:opacity-50"
              >
                撤回の申し出を記録
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
