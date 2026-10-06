"use client";

import { useEffect, useState } from "react";

/**
 * 使用者本人が記録簿の写し（証明書）の「電子交付」を承諾・撤回するパネル。 [G3/G4 / 第２ ４（３）（４）]
 *
 * 規制: 電磁的方法で交付する前に交付方法を示して承諾を得る。承諾が撤回された場合は電磁的方法で交付してはならない。
 * 未承諾・撤回済みなら開示文言を示して本人が承諾でき、承諾済みならいつでも撤回できる。
 * API: GET /api/customer/delivery-consent（状態・開示文言）・POST .../grant（承諾）・POST .../revoke（撤回）。
 * customer_id 無しセッション（401）では何も出さない。
 */
type Status = "none" | "granted" | "revoked" | "unknown";

export default function DeliveryConsentRevokePanel({ tenantSlug }: { tenantSlug: string }) {
  const [status, setStatus] = useState<Status>("unknown");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [consentText, setConsentText] = useState("");
  const [consentVersion, setConsentVersion] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer/delivery-consent?tenant=${encodeURIComponent(tenantSlug)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        setStatus((j?.status as Status) ?? "unknown");
        setConsentText(typeof j?.consent_text === "string" ? j.consent_text : "");
        setConsentVersion(typeof j?.consent_version === "string" ? j.consent_version : "");
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

  async function grant() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/delivery-consent/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenant_slug: tenantSlug, consent_version: consentVersion }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error((j?.message as string) ?? "承諾の記録に失敗しました");
      setStatus("granted");
      setAgreed(false);
      setMsg({ ok: true, text: "電子交付を承諾しました。記録簿の写しを電子的な方法でお受け取りいただけます。" });
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "エラーが発生しました" });
    } finally {
      setBusy(false);
    }
  }

  // 認証前（unknown）は何も出さない。撤回の導線は、記録簿の写しの電子交付を無効化する操作なので
  // 承諾の有無に関わらず提示してよい（none でも「電子交付を希望しない」事前の意思表示として有効）。
  if (status === "unknown") return null;

  return (
    <div className="mb-4 rounded-3xl border border-border-default bg-surface p-5 shadow-sm">
      <div className="text-sm font-semibold text-primary">点検整備記録簿等の電子交付について</div>
      {status !== "granted" ? (
        <>
          <p className="mt-1 text-sm text-secondary">
            {status === "revoked"
              ? "電子交付の承諾は撤回済みです。記録簿の写し（施工証明書）は書面等で交付されます。"
              : "記録簿の写し（施工証明書）を電子的な方法でお受け取りいただくには、事前のご承諾が必要です。"}
            電子でのお受け取りをご希望の場合は、下の内容をご確認のうえ承諾してください。
          </p>
          {consentText && consentVersion ? (
            <>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border-default bg-surface-hover p-3 text-xs leading-relaxed text-secondary">
                {consentText}
              </pre>
              <label className="mt-3 flex items-start gap-2 text-sm text-primary">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>上記の内容を確認し、電子的な方法での交付を承諾します</span>
              </label>
              <button
                onClick={grant}
                disabled={!agreed || busy}
                className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {busy ? "記録中…" : "承諾する"}
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-secondary">
            記録簿の写し（施工証明書）は、ご承諾のうえ電子的な方法（メール等）で交付しています。
            電子交付を希望されない場合は、下のボタンでいつでも撤回（お断り）でき、撤回後は書面等での交付に切り替わります。
          </p>
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
      {/* 成功/失敗メッセージは状態に関わらず1箇所で描画する（撤回成功時は status=revoked 側に出る）。 */}
      {msg ? (
        <div
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
