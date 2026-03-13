import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const adminEmails = (process.env.MARKET_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return adminEmails.includes(user.email.toLowerCase()) ? user : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const admin_user = await requireAdmin();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["approved", "suspended", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "approved") {
    update.approved_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("dealers")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dealer: data });
}
