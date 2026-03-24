import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const status = request.nextUrl.searchParams.get("status");

    let query = admin
      .from("agent_support_tickets")
      .select("*, agents:agent_id(id, name)")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 },
    );
  }
}
