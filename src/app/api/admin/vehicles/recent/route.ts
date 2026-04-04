import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: 最近使用した車両（証明書作成日ベース） ───
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden();
    }

    const tenantId = caller.tenantId;
    const admin = getAdminClient();

    // 証明書テーブルから vehicle_id ごとに最新の作成日と件数を取得
    // Supabase doesn't support GROUP BY directly, so we fetch recent certs with vehicle_id
    const { data: recentCerts, error: certErr } = await admin
      .from("certificates")
      .select("vehicle_id, created_at")
      .eq("tenant_id", tenantId)
      .not("vehicle_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (certErr) {
      return apiInternalError(certErr, "vehicles/recent cert query");
    }

    if (!recentCerts || recentCerts.length === 0) {
      return NextResponse.json({ vehicles: [] });
    }

    // Aggregate: group by vehicle_id, track last_cert_date and cert_count
    const vehicleMap = new Map<string, { last_cert_date: string; cert_count: number }>();
    for (const cert of recentCerts) {
      if (!cert.vehicle_id) continue;
      const vid = cert.vehicle_id as string;
      const existing = vehicleMap.get(vid);
      if (!existing) {
        vehicleMap.set(vid, { last_cert_date: cert.created_at, cert_count: 1 });
      } else {
        existing.cert_count += 1;
        if (cert.created_at > existing.last_cert_date) {
          existing.last_cert_date = cert.created_at;
        }
      }
    }

    // Sort by last_cert_date descending, take top 10
    const sorted = [...vehicleMap.entries()]
      .sort((a, b) => b[1].last_cert_date.localeCompare(a[1].last_cert_date))
      .slice(0, 10);

    const vehicleIds = sorted.map(([vid]) => vid);

    if (vehicleIds.length === 0) {
      return NextResponse.json({ vehicles: [] });
    }

    // Fetch vehicle details
    const { data: vehicles, error: vehErr } = await admin
      .from("vehicles")
      .select("id, maker, model, plate_display")
      .in("id", vehicleIds);

    if (vehErr) {
      return apiInternalError(vehErr, "vehicles/recent vehicle query");
    }

    const vehicleDetail = new Map<string, { maker: string | null; model: string | null; plate: string | null }>();
    for (const v of vehicles ?? []) {
      vehicleDetail.set(v.id, {
        maker: v.maker ?? null,
        model: v.model ?? null,
        plate: v.plate_display ?? null,
      });
    }

    // Build response in sorted order
    const result = sorted.map(([vid, stats]) => {
      const detail = vehicleDetail.get(vid);
      return {
        vehicle_id: vid,
        maker: detail?.maker ?? null,
        model: detail?.model ?? null,
        plate: detail?.plate ?? null,
        last_cert_date: stats.last_cert_date,
        cert_count: stats.cert_count,
      };
    });

    return NextResponse.json({ vehicles: result });
  } catch (e: unknown) {
    return apiInternalError(e, "vehicles/recent GET");
  }
}
