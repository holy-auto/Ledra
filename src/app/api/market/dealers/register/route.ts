import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 招待コードを使ってディーラーアカウントを登録する
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { invite_code } = body;

  if (!invite_code?.trim()) {
    return NextResponse.json({ error: "invite_code is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 招待コードでディーラーを取得
  const { data: dealer } = await admin
    .from("dealers")
    .select("*")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .eq("status", "pending")
    .single();

  if (!dealer) {
    return NextResponse.json({ error: "Invalid or already used invite code" }, { status: 404 });
  }

  // 既にこのユーザーがどこかのディーラーに紐付いていないか確認
  const { data: existingDealerUser } = await admin
    .from("dealer_users")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existingDealerUser) {
    return NextResponse.json({ error: "User already registered as dealer" }, { status: 409 });
  }

  // dealer_users に追加
  const { error: duError } = await admin.from("dealer_users").insert({
    dealer_id: dealer.id,
    user_id: user.id,
    role: "admin",
  });

  if (duError) return NextResponse.json({ error: duError.message }, { status: 500 });

  // ディーラーを承認済みに変更
  const { error: dError } = await admin
    .from("dealers")
    .update({
      status: "approved",
      invite_code: null, // 使用済みなのでクリア
      approved_at: new Date().toISOString(),
    })
    .eq("id", dealer.id);

  if (dError) return NextResponse.json({ error: dError.message }, { status: 500 });

  return NextResponse.json({ success: true, dealer_id: dealer.id });
}
