import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiInternalError, apiJson, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { insurerPiiDisclosureSchema } from "@/lib/validations/insurer";
import { recordInsurerAccessLog } from "@/lib/insurer/auditActions";
import { notifyOwnerOfPiiRequest } from "@/lib/insurer/ownerConsent";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const certificateId = req.nextUrl.searchParams.get("certificate_id");
  if (!certificateId) return apiValidationError("Missing certificate_id");

  const { admin } = createInsurerScopedAdmin(caller.insurerId);
  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .select(
      "id, certificate_id, insurer_id, insurer_requested_at, insurer_requested_by, insurer_reason, owner_consented_at, revoked_at, is_active, created_at, updated_at",
    )
    .eq("certificate_id", certificateId)
    .eq("insurer_id", caller.insurerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return apiInternalError(error, "insurer.pii-disclosure");

  // SQL の is_pii_disclosed() と同じ条件（保険会社の申請・オーナー本人の同意・未取消）。
  const disclosed = !!data && !!data.insurer_requested_at && !!data.owner_consented_at && !data.revoked_at;

  return apiJson({
    consent: data,
    disclosed,
    insurer_requested: !!data?.insurer_requested_at,
    owner_consented: !!data?.owner_consented_at,
  });
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const parsed = insurerPiiDisclosureSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { certificate_id, reason } = parsed.data;

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  const { data: prior, error: priorErr } = await admin
    .from("pii_disclosure_consents")
    .select("insurer_requested_at, owner_consented_at")
    .eq("certificate_id", certificate_id)
    .eq("insurer_id", caller.insurerId)
    .maybeSingle();
  if (priorErr) return apiInternalError(priorErr, "insurer.pii-disclosure");

  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .upsert(
      {
        certificate_id,
        insurer_id: caller.insurerId,
        insurer_requested_at: new Date().toISOString(),
        insurer_requested_by: caller.userId,
        insurer_reason: reason || null,
        is_active: true,
        // オーナーの同意は、そのとき見せた申請（理由）に対するもの。申請し直したら取り直す
        // （理由を差し替えたまま過去の同意で開示し続けないため。/code-review 指摘）。
        owner_consented_at: null,
        owner_consented_customer_id: null,
      },
      { onConflict: "certificate_id,insurer_id" },
    )
    .select(
      "id, certificate_id, insurer_id, insurer_requested_at, insurer_requested_by, insurer_reason, owner_consented_at, revoked_at, is_active, created_at, updated_at",
    )
    .single();

  if (error) return apiInternalError(error, "insurer.pii-disclosure");

  await recordInsurerAccessLog(
    admin,
    {
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      certificate_id,
      action: "pii_disclosure_request",
      meta: { reason: reason || null },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    },
    "POST /api/insurer/pii-disclosure",
  );

  // オーナー本人にマイページでの同意を依頼する（届かなくても申請自体は成立させる）。
  // 送るのは新しい申請のときと、同意を取り直すことになったときだけ。未同意のまま押し直すたびに
  // 同じメールが届かないようにする（/code-review 指摘）。
  if (!prior?.insurer_requested_at || prior.owner_consented_at) {
    void notifyOwnerOfPiiRequest(certificate_id, caller.insurerId);
  }

  return apiJson({ consent: data });
}
