import { NextResponse } from "next/server";
import { phoneLast4Hash } from "@/lib/customerPortalServer";
import { certificateCreateSchema } from "@/lib/validations/certificate";
import { apiOk, apiInternalError, apiValidationError } from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";

export const dynamic = "force-dynamic";

async function supaInsertCertificate(row: any) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(`${url}/rest/v1/certificates`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Supabase insert failed: ${res.status} ${txt}`);

  const json = txt ? JSON.parse(txt) : null;
  return Array.isArray(json) ? json[0] : json;
}

export async function POST(req: Request) {
  const deny = await enforceBilling(req, { minPlan: "free", action: "create" });
  if (deny) return deny as any;
  try {
    const body = await req.json();
    const parsed = certificateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。");
    }
    const b = parsed.data;

    const customer_phone_last4 = b.customer_phone_last4 ?? null;
    const customer_phone_last4_hash =
      customer_phone_last4 ? phoneLast4Hash(b.tenant_id, customer_phone_last4) : null;

    const insertRow = {
      tenant_id: b.tenant_id,
      status: b.status ?? "active",
      customer_name: b.customer_name,

      // 新規からはここを正しく保存
      customer_phone_last4,
      customer_phone_last4_hash,

      vehicle_info_json: b.vehicle_info_json ?? {},
      content_free_text: b.content_free_text ?? null,
      content_preset_json: b.content_preset_json ?? {},
      expiry_type: b.expiry_type ?? null,
      expiry_value: b.expiry_value ?? null,
      logo_asset_path: b.logo_asset_path ?? null,
      footer_variant: b.footer_variant ?? "holy",
    };

    const certificate = await supaInsertCertificate(insertRow);
    return NextResponse.json({ certificate }, { status: 200 });
  } catch (e) {
    return apiInternalError(e, "certificates/create");
  }
}
