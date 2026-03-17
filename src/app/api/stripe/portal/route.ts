import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { portalSchema } from "@/lib/validations/stripe";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound, apiError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeReturnUrl(req: NextRequest, candidate?: string | null) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? origin;
  const fallback = `${appUrl.replace(/\/+$/,"")}/admin/billing`;

  if (!candidate) return fallback;
  // open redirect 対策：APP_URL または Origin で始まるURLのみ許可
  if (appUrl && candidate.startsWith(appUrl)) return candidate;
  if (origin && candidate.startsWith(origin)) return candidate;
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const admin = getSupabaseAdmin();

    const body = await req.json().catch(() => ({} as any));
    const parsed = portalSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const { access_token, return_url: return_url_raw } = parsed.data;

    const u = await admin.auth.getUser(access_token);
    if (u.error || !u.data?.user) {
      return apiUnauthorized();
    }
    const user_id = u.data.user.id;

    const m = await admin
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (m.error) return apiInternalError(m.error, "read tenant_memberships");
    if (!m.data?.tenant_id) return apiNotFound("テナントメンバーシップが見つかりません。");

    const t = await admin
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", m.data.tenant_id)
      .maybeSingle();

    if (t.error) return apiInternalError(t.error, "read tenants");

    const customer = t.data?.stripe_customer_id;
    if (!customer) {
      return apiValidationError("stripe_customer_id is missing on tenants");
    }

    const return_url = safeReturnUrl(req, return_url_raw);

    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url,
    });

    return apiOk({ url: session.url });
  } catch (e) {
    return apiInternalError(e, "stripe portal");
  }
}

// GET は明示的に拒否（Billing側はPOSTで叩く想定）
export async function GET() {
  return apiError({ code: "validation_error", message: "Method Not Allowed", status: 405 });
}
