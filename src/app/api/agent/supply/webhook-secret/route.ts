/**
 * 代理店(供給パートナー)の受注確定 Webhook シークレット管理。
 *
 * - GET:  Webhook の受信 URL と「シークレット設定済みか」を返す (平文は返さない)。
 * - POST: 新しい署名シークレットを生成し暗号化保存。生成した平文は **この応答で一度だけ** 返す
 *         (以後は表示されない)。再生成すると旧シークレットは無効になる。
 *
 * RLS (spc_*_owner = my_supply_partner_ids 経由) により自代理店の行のみ読み書き可。
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { generateSupplyWebhookSecret } from "@/lib/supply/webhookSignature";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";
import { hasEncryptionKey } from "@/lib/crypto/secretBox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookUrl(partnerId: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const path = `/api/webhooks/supply/${partnerId}`;
  return base ? `${base}${path}` : path;
}

export async function GET() {
  const gate = await requireActiveSupplyPartner({ allowPending: true });
  if (gate instanceof NextResponse) return gate;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: cred } = await supabase
      .from("supply_partner_credentials")
      .select("webhook_secret_ciphertext")
      .eq("supply_partner_id", gate.partnerId)
      .maybeSingle();
    return apiJson({
      ok: true,
      webhook_url: webhookUrl(gate.partnerId),
      configured: Boolean(cred?.webhook_secret_ciphertext),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "supply webhook-secret get");
  }
}

export async function POST() {
  const gate = await requireActiveSupplyPartner({ allowPending: true });
  if (gate instanceof NextResponse) return gate;
  try {
    if (!hasEncryptionKey()) {
      return apiInternalError(new Error("SECRET_ENCRYPTION_KEY not set"), "supply webhook-secret rotate");
    }
    const secret = generateSupplyWebhookSecret();
    const { ciphertext } = await buildSecretWrite(secret);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("supply_partner_credentials")
      .upsert(
        { supply_partner_id: gate.partnerId, webhook_secret_ciphertext: ciphertext },
        { onConflict: "supply_partner_id" },
      );
    if (error) return apiInternalError(error, "supply webhook-secret upsert");

    // 平文はこの一度だけ返す。
    return apiJson({ ok: true, secret, webhook_url: webhookUrl(gate.partnerId) });
  } catch (e: unknown) {
    return apiInternalError(e, "supply webhook-secret rotate");
  }
}
