import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";
import { type PlanTier, PLAN_RANK as RANK } from "@/types/billing";
import { isPlatformTenantId } from "@/lib/auth/platformAdmin";

const DEFAULT_GRACE_DAYS = 14;

function graceDays(): number {
  const raw = process.env.BILLING_GRACE_DAYS ?? String(DEFAULT_GRACE_DAYS);
  const n = Math.max(0, Math.min(365, parseInt(raw, 10) || DEFAULT_GRACE_DAYS));
  return n;
}

function getSupabaseAdmin() {
  return createAdminClient();
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

function json(status: number, body: any, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });
}

function isNavigation(req: Request) {
  const accept = req.headers.get("accept") ?? "";
  const mode = req.headers.get("sec-fetch-mode") ?? "";
  const dest = req.headers.get("sec-fetch-dest") ?? "";
  return accept.includes("text/html") || mode === "navigate" || dest === "document";
}

function redirectToBilling(req: Request, reason: "inactive" | "plan", action?: string | null) {
  const origin = new URL(req.url).origin;
  const billing = new URL("/admin/billing", origin);

  const ref = req.headers.get("referer");
  try {
    if (ref) {
      const r = new URL(ref);
      billing.searchParams.set("return", r.pathname + r.search);
    }
  } catch {}

  billing.searchParams.set("reason", reason);
  if (action) billing.searchParams.set("action", action);

  return new Response(null, { status: 303, headers: { Location: billing.toString() } });
}

function redirectToPublic(pid: string, notice: string) {
  const dest = new URL(`/c/${pid}`, "https://example.invalid");
  dest.searchParams.set("notice", notice);
  // caller will replace origin
  return dest.pathname + dest.search;
}

function extractPublicIdFromUrl(req: Request): string | null {
  try {
    const u = new URL(req.url);
    return u.searchParams.get("public_id") ?? u.searchParams.get("publicId") ?? u.searchParams.get("pid");
  } catch {
    return null;
  }
}

async function extractTenantId(req: Request): Promise<string | null> {
  // query: tenant_id / tenant
  try {
    const u = new URL(req.url);
    const q = u.searchParams;
    const tid = q.get("tenant_id") ?? q.get("tenantId") ?? q.get("tenant") ?? null;
    if (tid) return tid;

    // query: certificate_id -> tenant_id
    const cid = q.get("certificate_id") ?? q.get("certificateId") ?? q.get("id");
    if (cid) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("certificates").select("tenant_id").eq("id", cid).limit(1).maybeSingle();
      if (!error && data?.tenant_id) return data.tenant_id as string;
    }

    // query: public_id -> tenant_id
    const pid = q.get("public_id") ?? q.get("publicId") ?? q.get("pid");
    if (pid) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("certificates").select("tenant_id").eq("public_id", pid).limit(1).maybeSingle();
      if (!error && data?.tenant_id) return data.tenant_id as string;
    }
  } catch {}

  // body: tenant_id / certificate_id / public_id
  try {
    const b: Record<string, unknown> = await req.clone().json();

    const tid = b?.tenant_id ?? b?.tenantId ?? b?.tenant ?? null;
    if (typeof tid === "string" && tid) return tid;

    const cid = b?.certificate_id ?? b?.certificateId ?? null;
    if (typeof cid === "string" && cid) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("certificates").select("tenant_id").eq("id", cid).limit(1).maybeSingle();
      if (!error && data?.tenant_id) return data.tenant_id as string;
    }

    const pid = b?.public_id ?? b?.publicId ?? b?.pid ?? null;
    if (typeof pid === "string" && pid) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("certificates").select("tenant_id").eq("public_id", pid).limit(1).maybeSingle();
      if (!error && data?.tenant_id) return data.tenant_id as string;
    }

    const ids = b?.certificate_ids ?? b?.certificateIds ?? b?.ids ?? null;
    if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === "string") {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from("certificates").select("tenant_id").eq("id", ids[0]).limit(1).maybeSingle();
      if (!error && data?.tenant_id) return data.tenant_id as string;
    }
  } catch {}

  return null;
}

async function graceInfoForTenant(stripe_subscription_id: string | null) {
  if (!stripe_subscription_id) return { ok: false as const, grace_until: null as string | null };

  try {
    const stripe = getStripe();
    const res: any = await stripe.subscriptions.retrieve(stripe_subscription_id);
    const sub: any = res?.data ?? res;

    const end = sub?.current_period_end ? Number(sub.current_period_end) : null;
    if (!end) return { ok: false as const, grace_until: null as string | null };

    const until = new Date((end + graceDays() * 86400) * 1000);
    return { ok: true as const, grace_until: until.toISOString(), period_end_unix: end as number };
  } catch {
    return { ok: false as const, grace_until: null as string | null };
  }
}

export async function enforceBilling(
  req: Request,
  opts: { minPlan: PlanTier; action?: string } = { minPlan: "free" }
): Promise<Response | null> {
  const tenant_id = await extractTenantId(req);
  const action = opts.action ?? null;

  if (!tenant_id) {
    return json(400, { error: "Missing tenant_id (billing guard)" }, { "x-billing-url": "/admin/billing" });
  }

  // --- Platform admin bypass: skip all billing checks ---
  if (isPlatformTenantId(tenant_id)) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("plan_tier, is_active, stripe_subscription_id")
    .eq("id", tenant_id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return json(404, { error: "Tenant not found (billing guard)" }, { "x-billing-url": "/admin/billing" });
  }

  const plan = (data.plan_tier ?? "free") as PlanTier;
  const active = !!data.is_active;

  // ---- inactive handling with grace for public_pdf ----
  if (!active) {
    // public_pdf は「猶予期間中だけ許可」
    if (action === "public_pdf") {
      const g = await graceInfoForTenant(data.stripe_subscription_id ?? null);
      const now = Date.now();

      if (g.ok && g.grace_until) {
        const untilMs = Date.parse(g.grace_until);
        if (Number.isFinite(untilMs) && now < untilMs) {
          // 猶予中：許可（ただし公開ページ側で“検証不可”は出る）
          return null;
        }

        // 猶予切れ：公開ページへ戻して理由表示（public_id が取れる時だけ）
        const pid = extractPublicIdFromUrl(req);
        if (pid && isNavigation(req)) {
          const origin = new URL(req.url).origin;
          const loc = origin + redirectToPublic(pid, "pdf_blocked");
          return new Response(null, { status: 303, headers: { Location: loc } });
        }

        return json(
          402,
          {
            error: "Billing inactive",
            message: "支払い停止中のため、PDF出力は利用できません。",
            billing_url: "/admin/billing",
            action,
            grace_until: g.grace_until,
          },
          { "x-billing-url": "/admin/billing" }
        );
      }

      // grace情報が取れない場合はブロック（安全側）
      const pid = extractPublicIdFromUrl(req);
      if (pid && isNavigation(req)) {
        const origin = new URL(req.url).origin;
        const loc = origin + redirectToPublic(pid, "pdf_blocked");
        return new Response(null, { status: 303, headers: { Location: loc } });
      }

      return json(
        402,
        {
          error: "Billing inactive",
          message: "支払い停止中のため、PDF出力は利用できません。",
          billing_url: "/admin/billing",
          action,
        },
        { "x-billing-url": "/admin/billing" }
      );
    }

    // admin 系は即ブロック（猶予は公開PDFだけ）
    if (isNavigation(req)) return redirectToBilling(req, "inactive", action);
    return json(
      402,
      {
        error: "Billing inactive",
        message: "支払いが停止しています。請求・プラン画面から支払いを再開してください。",
        billing_url: "/admin/billing",
        action,
      },
      { "x-billing-url": "/admin/billing" }
    );
  }

  // ---- plan restriction ----
  if (RANK[plan] < RANK[opts.minPlan]) {
    if (isNavigation(req)) return redirectToBilling(req, "plan", action);
    return json(
      403,
      {
        error: "Plan restricted",
        message: `この機能は ${opts.minPlan} 以上で利用できます。`,
        billing_url: "/admin/billing",
        action,
        current_plan: plan,
      },
      { "x-billing-url": "/admin/billing" }
    );
  }

  return null;
}
