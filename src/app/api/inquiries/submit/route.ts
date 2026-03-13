import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  public_id: z.string().min(1),
  sender_name: z.string().min(1).max(100),
  sender_email: z.string().email().optional().or(z.literal("")),
  sender_phone: z.string().max(20).optional().or(z.literal("")),
  body: z.string().min(1).max(2000),
  website: z.string().max(0).optional(), // honeypot
});

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

async function supaRest(path: string, opts: { method?: string; body?: any } = {}) {
  const { url, key } = getSupabaseAdmin();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: opts.method === "POST" ? "return=representation" : "",
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`supabase ${opts.method ?? "GET"} ${path} failed: ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function sendEmailResend(to: string, subject: string, html: string) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!apiKey || !from) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch((e) => console.error("[inquiry/submit] Resend failed", e));
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const b = parsed.data;

    // honeypot check
    if (b.website) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // resolve certificate -> tenant
    const certs = await supaRest(
      `certificates?select=id,tenant_id&public_id=eq.${encodeURIComponent(b.public_id)}&limit=1`
    );
    const cert = Array.isArray(certs) ? certs[0] : null;
    if (!cert?.tenant_id) {
      return NextResponse.json({ error: "certificate_not_found" }, { status: 404 });
    }

    // verify tenant is active
    const tenants = await supaRest(
      `tenants?select=id,is_active,name&id=eq.${cert.tenant_id}&limit=1`
    );
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant || !tenant.is_active) {
      return NextResponse.json({ error: "store_unavailable" }, { status: 400 });
    }

    // insert inquiry
    const insertRow = {
      tenant_id: cert.tenant_id,
      certificate_id: cert.id,
      public_id: b.public_id,
      sender_name: b.sender_name,
      sender_email: b.sender_email || null,
      sender_phone: b.sender_phone || null,
      body: b.body,
      status: "pending",
    };

    await supaRest("customer_inquiries", { method: "POST", body: insertRow });

    // send email notification to store owner (best-effort)
    try {
      const memberships = await supaRest(
        `tenant_memberships?select=user_id&tenant_id=eq.${cert.tenant_id}&limit=5`
      );
      if (Array.isArray(memberships) && memberships.length > 0) {
        const { url, key } = getSupabaseAdmin();
        for (const m of memberships) {
          const userRes = await fetch(`${url}/auth/v1/admin/users/${m.user_id}`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            cache: "no-store",
          });
          if (!userRes.ok) continue;
          const userData = await userRes.json();
          const email = userData?.email;
          if (!email) continue;

          const subject = "CARTRUSTでお問い合わせを受信しました";
          const html =
            `<p><b>${tenant.name ?? "店舗"}</b>にお問い合わせが届きました。</p>` +
            `<p><b>送信者:</b> ${b.sender_name}</p>` +
            (b.sender_email ? `<p><b>メール:</b> ${b.sender_email}</p>` : "") +
            `<p><b>内容:</b></p><p>${b.body.replace(/\n/g, "<br>")}</p>` +
            `<p>管理画面の「お問い合わせ」からご確認ください。</p>`;

          await sendEmailResend(email, subject, html);
        }
      }
    } catch (e) {
      console.error("[inquiry/submit] email notification failed", e);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("[inquiry/submit] error", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
