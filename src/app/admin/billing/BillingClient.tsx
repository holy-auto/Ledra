"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";

const PLANS = [
  {
    tier: "mini",
    name: "ミニ",
    price: "¥980/月",
    features: ["施工証明書 発行", "PDF出力（単体）", "QRコード生成", "基本ダッシュボード"],
  },
  {
    tier: "standard",
    name: "スタンダード",
    price: "¥2,980/月",
    features: ["ミニの全機能", "PDF一括出力（ZIP）", "CSV出力", "テンプレート管理", "帳票・請求書管理", "顧客CRM"],
    recommended: true,
  },
  {
    tier: "pro",
    name: "プロ",
    price: "¥9,800/月",
    features: ["スタンダードの全機能", "ロゴアップロード", "BtoB在庫管理", "Stripe決済連携", "優先サポート"],
  },
];

function PlanSelector({ currentPlan, isActive }: { currentPlan: string | null; isActive: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPlan = useCallback(async (tier: string) => {
    setBusy(tier);
    setError(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const access_token = sessionRes.data?.session?.access_token;
      if (!access_token) { window.location.href = "/login"; return; }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token, plan_tier: tier }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      if (!j?.url) throw new Error("checkout url missing");
      window.location.href = j.url;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }, [supabase]);

  return (
    <section className="space-y-4">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">PLANS</div>
      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.tier;
          return (
            <div
              key={plan.tier}
              className={`glass-card p-5 space-y-3 relative ${
                plan.recommended ? "ring-2 ring-[#0071e3]" : ""
              } ${isCurrent ? "border-[#0071e3]" : ""}`}
            >
              {plan.recommended && (
                <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-[#0071e3] text-white text-[10px] font-semibold rounded-full">
                  おすすめ
                </div>
              )}
              <div>
                <div className="text-lg font-bold text-primary">{plan.name}</div>
                <div className="text-2xl font-bold text-primary mt-1">{plan.price}</div>
              </div>
              <ul className="space-y-1.5 text-sm text-secondary">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-[#0071e3] mt-0.5">&#10003;</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="btn-ghost !text-xs text-center w-full cursor-default">
                  現在のプラン
                </div>
              ) : (
                <button
                  type="button"
                  className={`w-full ${plan.recommended ? "btn-primary" : "btn-secondary"} !text-xs`}
                  disabled={busy !== null}
                  onClick={() => handleSelectPlan(plan.tier)}
                >
                  {busy === plan.tier ? "処理中…" : "このプランを選択"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Tenant = {
  id: string;
  slug: string | null;
  name: string | null;
  plan_tier: string | null;
  is_active: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type SubInfo =
  | {
      id: string;
      status: string;
      current_period_start: number | null;
      current_period_end: number | null;
      cancel_at_period_end: boolean | null;
      cancel_at: number | null;
      trial_end: number | null;
    }
  | { error: string }
  | null;

function short(id?: string | null) {
  if (!id) return "-";
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function fmtUnix(unix?: number | null) {
  if (!unix) return "-";
  const d = new Date(unix * 1000);
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function planLabel(tier?: string | null) {
  switch (tier) {
    case "mini": return "ミニ";
    case "standard": return "スタンダード";
    case "pro": return "プロ";
    default: return tier ?? "-";
  }
}

function subStatusLabel(status?: string) {
  switch (status) {
    case "active": return "有効";
    case "trialing": return "トライアル中";
    case "past_due": return "支払い遅延（リトライ中）";
    case "canceled": return "解約済み";
    case "unpaid": return "未払い";
    case "incomplete": return "未完了";
    case "incomplete_expired": return "期限切れ";
    case "paused": return "一時停止";
    default: return status ?? "-";
  }
}

function daysLeft(unix?: number | null) {
  if (!unix) return null;
  const ms = unix * 1000 - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function BillingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [ret, setRet] = useState<string | null>(null);
  const [fromPortal, setFromPortal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sub, setSub] = useState<SubInfo>(null);

  const [portalBusy, setPortalBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      setStatus(qs.get("status"));
      setReason(qs.get("reason"));
      setAction(qs.get("action"));
      setRet(qs.get("return"));
      setFromPortal(qs.get("from") === "portal");
    } catch {
      setStatus(null);
      setReason(null);
      setAction(null);
      setRet(null);
      setFromPortal(false);
    }
  }, []);

  async function fetchBillingState() {
    if (busyRef.current) return;
    busyRef.current = true;
    setErr(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const access_token = sessionRes.data?.session?.access_token;
      if (!access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/admin/billing-state", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ access_token }),
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.error ? `${j.error}${j.detail ? " / " + j.detail : ""}` : `HTTP ${res.status}`);
      }

      setTenant(j.tenant as Tenant);
      setSub((j.subscription ?? null) as SubInfo);
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setTenant(null);
      setSub(null);

      try {
        await fetchBillingState();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // ポータル復帰後リトライ
  useEffect(() => {
    if (!fromPortal) return;

    const timers: any[] = [];
    const delays = [0, 1000, 3000, 7000];
    for (const d of delays) {
      timers.push(
        setTimeout(() => {
          fetchBillingState().catch((e: any) => setErr(e?.message ?? String(e)));
        }, d)
      );
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      url.searchParams.delete("r");
      window.history.replaceState({}, "", url.toString());
    } catch {}

    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPortal]);

  // フォーカス復帰でも更新
  useEffect(() => {
    const onFocus = () => fetchBillingState().catch((e: any) => setErr(e?.message ?? String(e)));
    const onVis = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    setErr(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const access_token = sessionRes.data?.session?.access_token;
      if (!access_token) {
        window.location.href = "/login";
        return;
      }

      const u = new URL(window.location.href);
      u.searchParams.set("from", "portal");
      u.searchParams.set("r", String(Date.now()));

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ return_url: u.toString(), access_token }),
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.error ? `${j.error}${j.detail ? " / " + j.detail : ""}` : `HTTP ${res.status}`);
      }
      if (!j?.url) throw new Error("portal url missing");

      window.location.href = j.url;
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setPortalBusy(false);
    }
  }

  async function resumeCheckout() {
    setResumeBusy(true);
    setErr(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const access_token = sessionRes.data?.session?.access_token;
      if (!access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/stripe/resume", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ access_token }),
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.error ? `${j.error}${j.detail ? " / " + j.detail : ""}` : `HTTP ${res.status}`);
      }
      if (!j?.url) throw new Error("resume url missing");

      window.location.href = j.url;
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setResumeBusy(false);
    }
  }

  const activeLabel = tenant?.is_active === true ? "有効" : tenant?.is_active === false ? "停止" : "-";
  const subErr = sub && "error" in sub ? sub.error : null;
  const subOk = sub && !("error" in sub) ? sub : null;

  return (
    <main className="space-y-6">
      <PageHeader tag="BILLING" title="請求・プラン" />

      {status && (
        <div className={`glass-card p-4 text-sm ${status === "success" ? "text-[#0071e3] glow-cyan" : "text-amber-400 glow-amber"}`}>
          決済結果: <b>{status === "success" ? "成功" : status === "cancel" ? "キャンセル" : status}</b>
        </div>
      )}

      {(reason || action) && (
        <div className="glass-card p-4 text-sm">
          <div className="font-semibold text-primary">アクセスが制限されました</div>
          <div className="mt-1 text-muted">
            {reason === "inactive"
              ? "支払いが停止しているため、この操作は実行できません。下の「支払いを再開」から再開してください。"
              : reason === "plan"
              ? "現在のプランではこの機能は利用できません。プラン変更をご検討ください。"
              : "この操作は制限されています。"}
          </div>
          {action && (
            <div className="mt-2 text-muted">
              対象機能: <span className="text-[#0071e3] font-mono">{action}</span>
            </div>
          )}
          {ret && (
            <div className="mt-2 text-muted">
              元の画面:{" "}
              <a className="underline text-[#0071e3]" href={ret}>
                戻る
              </a>
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-sm text-muted">Loading…</div>}

      {err && (
        <div className="glass-card p-4 text-sm">
          <div className="font-semibold text-red-500">Error</div>
          <div className="mt-1 whitespace-pre-wrap text-red-500">{err}</div>
        </div>
      )}

      {!loading && tenant && (
        <div className="glass-card p-5 space-y-3 text-sm">
          <div className="text-secondary">
            店舗: <b className="text-primary">{tenant.name ?? tenant.slug ?? tenant.id}</b>
          </div>
          <div className="text-secondary">
            利用状態: <b className="text-primary">{activeLabel}</b>
          </div>
          <div className="text-secondary">
            プラン: <b className="text-primary">{planLabel(tenant.plan_tier)}</b>
          </div>
          <div className="text-secondary">
            決済: <b className="text-primary">{tenant.stripe_subscription_id ? "連携済み" : "未連携"}</b>
          </div>

          {tenant.stripe_subscription_id && (
            <details className="pt-2">
              <summary className="cursor-pointer text-muted hover:text-secondary">サポート用ID（必要なときだけ）</summary>
              <div className="mt-2 space-y-1 text-secondary">
                <div>
                  顧客ID: <span className="text-[#0071e3] font-mono">{short(tenant.stripe_customer_id)}</span>
                </div>
                <div>
                  契約ID: <span className="text-[#0071e3] font-mono">{short(tenant.stripe_subscription_id)}</span>
                </div>
              </div>
            </details>
          )}

          <div className="pt-2">
            <div className="font-semibold text-primary">有効期限・次回請求</div>
            {subErr && <div className="text-muted">Stripe期限の取得に失敗: {subErr}</div>}
            {subOk && (
              <div className="space-y-1 text-secondary">
                <div>
                  契約状態: <b className="text-primary">{subStatusLabel(subOk.status)}</b>
                </div>
                <div>
                  期間開始: <b className="text-primary">{fmtUnix(subOk.current_period_start)}</b>
                </div>
                <div>
                  次回請求日（有効期限）: <b className="text-primary">{fmtUnix(subOk.current_period_end)}</b>
                  {(() => {
                    const d = daysLeft(subOk.current_period_end);
                    return d !== null ? <span className="ml-2 text-muted">（あと{d}日）</span> : null;
                  })()}
                </div>
                {subOk.cancel_at_period_end && (
                  <div>
                    解約予約: <b className="text-primary">あり</b>（終了日: <b className="text-primary">{fmtUnix(subOk.current_period_end)}</b>）
                  </div>
                )}
                {subOk.trial_end && (
                  <div>
                    トライアル終了: <b className="text-primary">{fmtUnix(subOk.trial_end)}</b>
                  </div>
                )}
              </div>
            )}
            {!sub && <div className="text-muted">subscription が無い（未課金/未紐づけ）</div>}
          </div>

          {tenant.is_active === false && (
            <div className="glass-card p-4 text-sm">
              <div className="font-semibold text-amber-400">支払いが停止しています</div>
              <div className="mt-1 text-muted">この状態では機能が制限されます。下の「支払いを再開」で再決済してください。</div>
            </div>
          )}

          <div className="pt-3 flex gap-3 flex-wrap">
            <button className="btn-secondary" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? "Opening…" : "請求ポータル（プラン変更）"}
            </button>

            {tenant.is_active === false && (
              <button className="btn-primary" onClick={resumeCheckout} disabled={resumeBusy}>
                {resumeBusy ? "Redirecting…" : "支払いを再開"}
              </button>
            )}
          </div>

          <div className="pt-2 text-xs text-muted">※ ポータル復帰時は自動で数回リトライして最新状態に同期します。</div>
        </div>
      )}

      {/* Plan selection */}
      {!loading && tenant && (
        <PlanSelector currentPlan={tenant.plan_tier} isActive={tenant.is_active === true} />
      )}
    </main>
  );
}
