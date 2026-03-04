"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tenant = {
  id: string;
  slug: string | null;
  name: string | null;
  plan_tier: string | null;
  is_active: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function short(id?: string | null) {
  if (!id) return "-";
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export default function BillingPage() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const [portalBusy, setPortalBusy] = useState(false);

  const status = sp.get("status"); // success / cancel が来る想定

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      setTenant(null);

      try {
        const u = await supabase.auth.getUser();
        if (!u.data?.user) {
          window.location.href = "/login";
          return;
        }

        // 1) membership から tenant_id を取る（最短で1件）
        const m = await supabase
          .from("tenant_memberships")
          .select("tenant_id")
          .eq("user_id", u.data.user.id)
          .limit(1)
          .maybeSingle();

        if (m.error) throw m.error;
        if (!m.data?.tenant_id) throw new Error("tenant_memberships が見つかりません（user_id に紐づく tenant が無い）");

        // 2) tenants を読む（RLSで読める前提）
        const t = await supabase
          .from("tenants")
          .select("id, slug, name, plan_tier, is_active, stripe_customer_id, stripe_subscription_id")
          .eq("id", m.data.tenant_id)
          .maybeSingle();

        if (t.error) throw t.error;
        if (!t.data) throw new Error("tenants が見つかりません（tenant_id が無効）");

        setTenant(t.data as Tenant);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function openPortal() {
    setPortalBusy(true);
    try {
      // まず POST（JSONで url を返す実装を想定）
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ return_url: window.location.href }),
      });

      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j?.url) {
          window.location.href = j.url;
          return;
        }
      }

      // fallback: GET redirect 型の実装にも対応
      window.location.href = "/api/stripe/portal";
    } finally {
      setPortalBusy(false);
    }
  }

  const activeLabel =
    tenant?.is_active === true ? "ACTIVE" : tenant?.is_active === false ? "INACTIVE" : "-";

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Billing</h1>

      {status && (
        <div className="rounded border p-3 text-sm">
          Checkout status: <b>{status}</b>
        </div>
      )}

      {loading && <div className="text-sm opacity-70">Loading…</div>}

      {err && (
        <div className="rounded border p-3 text-sm">
          <div className="font-semibold">Error</div>
          <div className="mt-1 whitespace-pre-wrap">{err}</div>
        </div>
      )}

      {!loading && !err && tenant && (
        <div className="rounded border p-4 space-y-2 text-sm">
          <div>
            店舗: <b>{tenant.name ?? tenant.slug ?? tenant.id}</b>
          </div>
          <div>
            状態: <b>{activeLabel}</b>
          </div>
          <div>
            プラン: <b>{tenant.plan_tier ?? "-"}</b>
          </div>
          <div>
            Stripe customer: <span className="font-mono">{short(tenant.stripe_customer_id)}</span>
          </div>
          <div>
            Stripe subscription:{" "}
            <span className="font-mono">{short(tenant.stripe_subscription_id)}</span>
          </div>

          <div className="pt-3 flex gap-2">
            <button
              className="rounded border px-3 py-2"
              onClick={openPortal}
              disabled={portalBusy}
            >
              {portalBusy ? "Opening…" : "Stripe請求ポータルを開く"}
            </button>

            <Link className="rounded border px-3 py-2" href="/admin">
              管理画面に戻る
            </Link>
          </div>

          <div className="pt-2 text-xs opacity-70">
            ※ このページは success_url / cancel_url の返り先。DB反映とポータル導線の確認用。
          </div>
        </div>
      )}
    </main>
  );
}
