import { NextRequest, NextResponse } from "next/server";
import { apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map service_type codes to Japanese display labels */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  ppf: "PPF施工証明",
  coating: "コーティング施工証明",
  tint: "ウィンドウティント施工証明",
  wrap: "ラッピング施工証明",
  body_repair: "板金修理証明",
  maintenance: "メンテナンス記録",
  other: "施工証明",
};

/**
 * GET /api/certificate/og?pid=PUBLIC_ID
 *
 * Returns Open Graph metadata for social sharing / link previews.
 * No sensitive data (no customer name, no exact plate).
 */
export async function GET(req: NextRequest) {
  try {
    // General rate limit: 30 req/min per IP
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`cert-og:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const pid = req.nextUrl.searchParams.get("pid");
    if (!pid) return apiValidationError("pid は必須です。");

    const supabase = getSupabaseAdmin();

    const { data: cert, error } = await supabase
      .from("certificates")
      .select("id, public_id, status, created_at, service_type, vehicle_id, vehicle_info_json")
      .eq("public_id", pid)
      .limit(1)
      .maybeSingle();

    if (error) {
      return apiInternalError(error, "certificate-og fetch");
    }

    if (!cert) {
      // Return generic metadata for unknown IDs
      return NextResponse.json(
        {
          title: "Ledra 証明書",
          description: "証明書が見つかりませんでした。",
          og_image_url: null,
        },
        { status: 200, headers: { "cache-control": "public, max-age=60" } },
      );
    }

    // Build vehicle description (maker + model only, no plate)
    let vehicleLabel = "";
    // Try vehicle_info_json first (embedded snapshot)
    const vi = cert.vehicle_info_json as Record<string, string> | null;
    if (vi?.maker || vi?.model) {
      vehicleLabel = [vi.maker, vi.model].filter(Boolean).join(" ");
    }
    // Fall back to linked vehicle record
    if (!vehicleLabel && cert.vehicle_id) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("maker, model")
        .eq("id", cert.vehicle_id)
        .limit(1)
        .maybeSingle<{ maker: string | null; model: string | null }>();
      if (vehicle) {
        vehicleLabel = [vehicle.maker, vehicle.model].filter(Boolean).join(" ");
      }
    }

    const serviceLabel = SERVICE_TYPE_LABELS[(cert.service_type as string) ?? ""] ?? "施工証明";
    const issuedAt = cert.created_at ? cert.created_at.slice(0, 10) : "不明";

    const statusLabel =
      cert.status === "active"
        ? "有効"
        : cert.status === "void"
          ? "無効"
          : cert.status === "expired"
            ? "期限切れ"
            : String(cert.status ?? "不明");

    const title = `Ledra 証明書 - ${serviceLabel}`;

    const descParts: string[] = [];
    if (vehicleLabel) descParts.push(`車両: ${vehicleLabel}`);
    descParts.push(`発行日: ${issuedAt}`);
    descParts.push(`ステータス: ${statusLabel}`);
    const description = descParts.join(" / ");

    return NextResponse.json(
      {
        title,
        description,
        og_image_url: null,
      },
      { status: 200, headers: { "cache-control": "public, max-age=60" } },
    );
  } catch (e) {
    return apiInternalError(e, "certificate-og");
  }
}
