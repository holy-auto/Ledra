import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import { apiInternalError, apiJson, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

export const runtime = "nodejs";

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const planDeny = enforceInsurerPlan(caller, "pro");
    if (planDeny) return planDeny;

    const url = new URL(req.url);
    const pid = url.searchParams.get("pid");
    if (!pid) return apiValidationError("pid is required");

    const { ip, ua } = getClientMeta(req);

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("insurer_get_certificate", {
      p_public_id: pid,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (error) return apiInternalError(error, "insurer.export-one");

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return apiNotFound("証明書が見つかりません。");

    const { error: logErr } = await supabase.rpc("insurer_audit_log", {
      p_action: "insurer.export.csv.one",
      p_target_public_id: pid,
      p_query_json: null,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (logErr) return apiValidationError(logErr.message);

    const vehicleModel = row.vehicle_model ?? "";
    const vehiclePlate = row.vehicle_plate ?? "";

    const header = [
      "public_id",
      "status",
      "tenant_id",
      "customer_name",
      "vehicle_model",
      "vehicle_plate",
      "service_type",
      "certificate_no",
      "created_at",
    ];
    const body = buildCsv(header, [
      [
        row.public_id,
        row.status,
        row.tenant_id,
        row.customer_name,
        vehicleModel,
        vehiclePlate,
        row.service_type,
        row.certificate_no,
        row.created_at,
      ],
    ]);

    return new NextResponse(body, {
      headers: csvDownloadHeaders(`insurer_certificate_${pid}.csv`),
    });
  } catch (e) {
    console.error("[insurer/export-one]", e);
    return apiJson({ error: "internal_error", message: "内部エラーが発生しました" }, { status: 500 });
  }
}
