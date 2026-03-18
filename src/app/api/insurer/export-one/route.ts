import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";

export const runtime = "nodejs";

function csvEscape(v: unknown) {
  const s = (v ?? "").toString();
  const escaped = s.replace(/"/g, '""');
  if (/[",\r\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function getClientMeta(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  return { ip, ua };
}

export async function GET(req: Request) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

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
  if (error) return apiValidationError(error.message);

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

  const header = ["public_id", "status", "tenant_id", "customer_name", "vehicle_model", "vehicle_plate", "service_type", "certificate_no", "created_at"];
  const line = [
    csvEscape(row.public_id),
    csvEscape(row.status),
    csvEscape(row.tenant_id),
    csvEscape(row.customer_name),
    csvEscape(vehicleModel),
    csvEscape(vehiclePlate),
    csvEscape(row.service_type),
    csvEscape(row.certificate_no),
    csvEscape(row.created_at),
  ].join(",");

  const bom = "\uFEFF";
  const body = bom + header.join(",") + "\r\n" + line;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="insurer_certificate_${pid}.csv"`,
      "cache-control": "no-store",
    },
  });
}
