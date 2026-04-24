import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

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

export async function GET(req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const planDeny = enforceInsurerPlan(caller, "pro");
    if (planDeny) return planDeny;

    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";

    const limit = 2000;
    const offset = 0;

    const { ip, ua } = getClientMeta(req);

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("insurer_search_certificates", {
      p_query: q,
      p_limit: limit,
      p_offset: offset,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (error) return apiValidationError(error.message);

    const { error: logErr } = await supabase.rpc("insurer_audit_log", {
      p_action: "insurer.export.csv",
      p_target_public_id: null,
      p_query_json: { q, limit, offset },
      p_ip: ip,
      p_user_agent: ua,
    });
    if (logErr) return apiValidationError(logErr.message);

    // RPC insurer_search_certificates の戻り row 型 (明示的に select していないので
    // 必要なフィールドのみ拾う)。
    type InsurerExportRow = {
      public_id: string;
      status: string | null;
      customer_name: string | null;
      vehicle_model?: string | null;
      vehicle_plate?: string | null;
      created_at: string | null;
      tenant_id: string | null;
    };
    const rows: InsurerExportRow[] = (data ?? []) as InsurerExportRow[];
    const header = [
      "public_id",
      "status",
      "customer_name",
      "vehicle_model",
      "vehicle_plate",
      "created_at",
      "tenant_id",
    ];

    // Stream CSV to avoid building large string in memory
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // BOM + header
        controller.enqueue(encoder.encode("\uFEFF" + header.join(",") + "\r\n"));
        for (const r of rows) {
          controller.enqueue(
            encoder.encode(
              [
                csvEscape(r.public_id),
                csvEscape(r.status),
                csvEscape(r.customer_name),
                csvEscape(r.vehicle_model),
                csvEscape(r.vehicle_plate),
                csvEscape(r.created_at),
                csvEscape(r.tenant_id),
              ].join(",") + "\r\n",
            ),
          );
        }
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="insurer_certificates_${Date.now()}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("[insurer/export]", e);
    return NextResponse.json({ error: "internal_error", message: "内部エラーが発生しました" }, { status: 500 });
  }
}
