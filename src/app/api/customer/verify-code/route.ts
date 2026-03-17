import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  createSession,
  getLatestValidCodeRow,
  getTenantIdBySlug,
  markCodeAttempt,
  markCodeUsed,
  normalizeEmail,
  otpCodeHash,
  phoneLast4Hash,
  CUSTOMER_COOKIE,
} from "@/lib/customerPortalServer";

const LAST4_COOKIE = "hc_l4";

const isSecureCookie = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const tenant_slug = (body.tenant_slug ?? "").toString().trim();
    const emailRaw = (body.email ?? "").toString();
    const last4Raw = (body.phone_last4 ?? "").toString();
    const code = (body.code ?? "").toString().trim();

    if (!tenant_slug) return NextResponse.json({ error: "missing tenant_slug" }, { status: 400 });

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

    const email = normalizeEmail(emailRaw);
    if (!email.includes("@")) return NextResponse.json({ error: "invalid email" }, { status: 400 });

    let phoneHash: string;
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return NextResponse.json({ error: "invalid phone_last4" }, { status: 400 });
    }

    const row = await getLatestValidCodeRow(tenantId, email, phoneHash);
    if (!row) return NextResponse.json({ error: "no code" }, { status: 404 });

    if (row.used_at) return NextResponse.json({ error: "code used" }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "code expired" }, { status: 400 });

    const expected = otpCodeHash(tenantId, email, phoneHash, code);
    if (expected !== row.code_hash) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      await markCodeAttempt(row.id, nextAttempts);
      return NextResponse.json({ error: "invalid code" }, { status: 400 });
    }

    await markCodeUsed(row.id);

    const last4Plain = String((body as any).phone_last4 ?? (body as any).last4 ?? "").trim();
    if (!/^\d{4}$/.test(last4Plain)) {
      return NextResponse.json({ error: "phone_last4 required" }, { status: 400 });
    }
    const sess = await createSession(tenantId, email, phoneHash, last4Plain);

    const res = NextResponse.json({ ok: true });

    res.cookies.set(CUSTOMER_COOKIE, sess.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    // フォールバック検索用に last4 も cookie に保持（httpOnlyでOK）
    res.cookies.set(LAST4_COOKIE, last4Raw.trim(), {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch (e: any) {
    console.error("customer verify-code error", e);
    return NextResponse.json({ error: e?.message ?? "verify-code failed" }, { status: 500 });
  }
}
