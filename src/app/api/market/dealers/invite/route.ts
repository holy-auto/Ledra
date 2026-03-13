import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteCode } from "@/lib/market/auth";

// 管理者のみ: ディーラーを招待する
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 管理者チェック（tenant_memberships に存在すること）
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { company_name, contact_name, phone, address, prefecture } = body;

  if (!company_name?.trim()) {
    return NextResponse.json({ error: "company_name is required" }, { status: 400 });
  }

  const inviteCode = generateInviteCode();

  const { data, error } = await admin
    .from("dealers")
    .insert({
      company_name: company_name.trim(),
      contact_name: contact_name?.trim() ?? null,
      phone: phone?.trim() ?? null,
      address: address?.trim() ?? null,
      prefecture: prefecture?.trim() ?? null,
      invite_code: inviteCode,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dealer: data, invite_code: inviteCode });
}
