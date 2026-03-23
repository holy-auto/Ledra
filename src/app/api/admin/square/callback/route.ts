import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

// ─── GET: Square OAuth コールバック ───
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenantId
  const error = url.searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  // ユーザーが拒否した場合
  if (error) {
    return NextResponse.redirect(
      new URL("/admin/square?square=denied", baseUrl),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/admin/square?square=error&reason=missing_params", baseUrl),
    );
  }

  // state がテナントIDとして有効か検証
  const admin = getAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("id", state)
    .maybeSingle();

  if (!tenant) {
    console.error("[square callback] invalid state (tenant not found):", state);
    return NextResponse.redirect(
      new URL("/admin/square?square=error&reason=invalid_state", baseUrl),
    );
  }

  const tenantId = tenant.id as string;

  try {
    // 1. Exchange code for tokens
    // redirect_uri MUST match the one sent during /oauth2/authorize
    const redirectUri = `${baseUrl}/api/admin/square/callback`;
    const tokenBody: Record<string, string> = {
      client_id: process.env.SQUARE_APP_ID!,
      client_secret: process.env.SQUARE_APP_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };

    const tokenRes = await fetch("https://connect.squareup.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[square callback] token exchange failed:", tokenRes.status, errBody);
      // Include status in redirect for easier debugging
      const reason = `token_exchange_${tokenRes.status}`;
      return NextResponse.redirect(
        new URL(`/admin/square?square=error&reason=${reason}`, baseUrl),
      );
    }

    const tokenData = await tokenRes.json();
    const {
      access_token,
      refresh_token,
      expires_at,
      merchant_id,
    } = tokenData;

    // 2. Fetch locations
    let locationIds: string[] = [];
    try {
      const locRes = await fetch("https://connect.squareup.com/v2/locations", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (locRes.ok) {
        const locData = await locRes.json();
        locationIds = (locData.locations ?? []).map(
          (loc: { id: string }) => loc.id,
        );
      }
    } catch (locErr) {
      console.error("[square callback] failed to fetch locations:", locErr);
      // 場所の取得失敗は致命的でないので続行
    }

    // 3. Upsert into square_connections
    const { error: dbError } = await admin
      .from("square_connections")
      .upsert(
        {
          tenant_id: tenantId,
          square_access_token: access_token,
          square_refresh_token: refresh_token,
          square_token_expires_at: expires_at,
          square_merchant_id: merchant_id ?? null,
          square_location_ids: locationIds,
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

    if (dbError) {
      console.error("[square callback] db upsert error:", dbError.message);
      return NextResponse.redirect(
        new URL("/admin/square?square=error&reason=db_save", baseUrl),
      );
    }

    return NextResponse.redirect(
      new URL("/admin/square?square=connected", baseUrl),
    );
  } catch (e) {
    console.error("[square callback] unexpected error:", e);
    return NextResponse.redirect(
      new URL("/admin/square?square=error&reason=unexpected", baseUrl),
    );
  }
}
