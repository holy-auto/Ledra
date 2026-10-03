"use client";

import { useEffect, useState } from "react";

/**
 * 使用者本人が記録簿の写し（証明書）の「電子交付」の承諾を撤回するパネル。 [G4 / 第２ ４（４）]
 *
 * 規制: 承諾が撤回された場合は電磁的方法で交付してはならない。撤回すると証明書の電子交付
 * （受領サイン依頼メール・署名依頼）がブロックされ、以後は書面交付等に切り替わる。
 * API: GET /api/customer/delivery-consent（状態）・POST /api/customer/delivery-consent/revoke（撤回）。
 * 承諾の付与は店舗側の記録（顧客詳細パネル）で、ここでは行わない。customer_id 無しセッション（401）では何も出さない。
 */
type Status = "none" | "granted" | "revoked" | "unknown";

export default function DeliveryConsentRevokePanel({ tenantSlug }: { tenantSlug: string }) {
  const [status, setStatus] = useState<Status>("unknown");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer/delivery-consent?tenant=${encodeURIComponent(tenantSlug)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setStatus((j?.status as Status) ?? "unknown");
      })
      .catch((): void => undefined);
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  async function revoke() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/delivery-consent/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenant_slug: tenantSlug }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error((j?.message as string) ?? "撤回の記録に失敗しました");
      setStatus("revoked");
      setConfirming(false);
      setMsg({ ok: true, text: "電子交付の承諾を撤回しました。以後は書面等での交付に切り替わります。" });
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "エラーが発生しました" });
    } finally {
      setBusy(false);
    }
  }

  // 認証前（unknown）は何も出さない。撤回の導線は、記録簿の写しの電子交付を無効化する操作なので
  // 承諾の有無に関わらず提示してよい（none でも「電子交付を希望しない」意思表示として有効）。
  if (status === "unknown") return null;

  return (
    <div className="mb-4 rounded-3xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="text-sm font-semibold text-primary">点検整備記録簿等の電子交付について</div>
      {status === "revoked" ? (
        <p className="mt-1 text-sm text-secondary">
          電子交付の承諾は<strong>撤回済み</strong>です。記録簿の写し（証明書）は電子ではなく書面等で交付されます。
          再度電子交付をご希望の場合は店舗にお申し付けください。
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-secondary">
            記録簿の写し（施工証明書）は、ご承諾のうえ電子的な方法（メール等）で交付しています。
            電子交付を希望されない場合は、下のボタンでいつでも撤回できます。撤回後は書面等での交付に切り替わります。
          </p>
          {msg ? (
            <div
              className={`mt-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
            >
              {msg.text}
            </div>
          ) : null}
          {confirming ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-secondary">本当に撤回しますか？</span>
              <button
                onClick={revoke}
                disabled={busy}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {busy ? "記録中…" : "撤回する"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                やめる
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="mt-3 rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-hover"
            >
              電子交付の承諾を撤回する
            </button>
          )}
        </>
      )}
      {status === "revoked" && msg ? (
        <div
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
