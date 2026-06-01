import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /ref/<code>
 *
 * Public landing for agent referral links (agent_referral_links.url points
 * here). Records the click, drops an attribution cookie, then forwards to
 * signup. The cookie is consumed by /api/signup to create the linked
 * agent_referrals row. Invalid codes still redirect (no cookie), so we never
 * leak which codes are valid.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { code } = await ctx.params;
  const signupUrl = new URL("/signup", req.nextUrl.origin);

  let valid = false;
  try {
    const admin = createServiceRoleAdmin("ref-link landing — pre-auth public click attribution");
    const { data: link } = await admin
      .from("agent_referral_links")
      .select("id")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (link) {
      valid = true;
      // Atomic increment (security-definer RPC); best-effort analytics.
      await admin.rpc("increment_referral_link_click", { p_code: code });
    }
  } catch {
    // Never block the signup funnel on attribution failures.
  }

  const res = NextResponse.redirect(signupUrl, { status: 302 });
  if (valid) {
    res.cookies.set("ledra_ref", code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return res;
}
