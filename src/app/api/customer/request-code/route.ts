import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/url";
import {
  createLoginCode,
  getTenantIdBySlug,
  normalizeEmail,
  phoneLast4Hash,
  tenantHasPhoneHash,
} from "@/lib/customerPortalServer";

function genCode6(): string {
  // 000000〜999999（先頭ゼロあり）
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, "0");
}

async function sendEmailResend(to: string, subject: string, html: string) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();

  if (!apiKey) throw new Error("missing RESEND_API_KEY");
  if (!from) throw new Error("missing RESEND_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[request-code] Resend failed", res.status, body);
    throw new Error(`resend_failed:${res.status}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const tenant_slug = (body.tenant_slug ?? "").toString().trim();
    const emailRaw = (body.email ?? "").toString();
    const last4Raw = (body.last4 ?? body.phone_last4 ?? "").toString().trim();

    if (!tenant_slug) return NextResponse.json({ error: "missing tenant_slug" }, { status: 400 });
    if (!emailRaw) return NextResponse.json({ error: "missing email" }, { status: 400 });
    if (!last4Raw) return NextResponse.json({ error: "missing last4" }, { status: 400 });
    if (!/^\d{4}$/.test(last4Raw)) return NextResponse.json({ error: "invalid last4" }, { status: 400 });

    const email = normalizeEmail(emailRaw);

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

    let phoneHash = "";
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return NextResponse.json({ error: "hash_failed" }, { status: 400 });
    }

    const ok = await tenantHasPhoneHash(tenantId, phoneHash);
    if (!ok) return NextResponse.json({ error: "no matching certificates" }, { status: 404 });

    const code = genCode6();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分
    await createLoginCode(tenantId, email, phoneHash, code, expires);

    const baseUrl = resolveBaseUrl({ req });

    // ✅ auto=1&tenant=... でログイン画面が自動で verify まで実行する（既存仕様）
    const loginUrl =
      `${baseUrl}/customer/${tenant_slug}/login` +
      `?email=${encodeURIComponent(email)}` +
      `&last4=${encodeURIComponent(last4Raw)}` +
      `&code=${encodeURIComponent(code)}` +
      `&auto=1&tenant=${encodeURIComponent(tenant_slug)}`;

    const subject = "ログインコード（WEB施工証明書）";
    const html =
      `<p>ログイン用リンクです（10分以内）。</p>` +
      `<p><a href="${loginUrl}">${loginUrl}</a></p>` +
      `<p>リンクが開けない場合は、ログイン画面でコード入力してください：<b>${code}</b></p>`;

    await sendEmailResend(email, subject, html);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("[request-code] error", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}