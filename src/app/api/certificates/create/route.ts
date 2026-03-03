import { NextResponse } from "next/server";
import { z } from "zod";
import { phoneLast4Hash } from "@/lib/customerPortalServer";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.string().optional().default("active"),
  customer_name: z.string().min(1),
  customer_phone_last4: z.string().regex(/^\d{4}$/).optional(),
  vehicle_info_json: z.any().optional(),
  content_free_text: z.string().nullable().optional(),
  content_preset_json: z.any().optional(),
  expiry_type: z.string().nullable().optional(),
  expiry_value: z.string().nullable().optional(),
  logo_asset_path: z.string().nullable().optional(),
  footer_variant: z.string().nullable().optional(),
});

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
  try {
    const body = await req.json();
    const b = BodySchema.parse(body);

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
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "create failed" },
      { status: 500 }
    );
  }
}