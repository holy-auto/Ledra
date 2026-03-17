import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slugify(name: string): string {
  // 日本語の場合はランダム slug、英数字があればハイフン区切り
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const base = ascii || "insurer";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const company_name = String(body.company_name ?? "").trim();
  const contact_person = String(body.contact_person ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const requested_plan = String(body.requested_plan ?? "basic").toLowerCase();

  // --- validation ---
  const errors: string[] = [];
  if (!company_name) errors.push("会社名は必須です");
  if (!contact_person) errors.push("担当者名は必須です");
  if (!email || !isValidEmail(email)) errors.push("有効なメールアドレスを入力してください");
  if (password.length < 8) errors.push("パスワードは8文字以上で入力してください");
  if (!["basic", "standard", "pro"].includes(requested_plan)) {
    errors.push("プランは basic / standard / pro から選択してください");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "validation_error", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();
  let userId: string | null = null;

  try {
    // 1. Auth ユーザー作成
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
        return NextResponse.json(
          { error: "email_exists", message: "このメールアドレスは既に登録されています" },
          { status: 409 }
        );
      }
      throw new Error(`Auth user creation failed: ${authError.message}`);
    }

    userId = authData.user.id;

    // 2. insurers レコード作成
    const slug = slugify(company_name);
    const { data: insurer, error: insurerError } = await supabase
      .from("insurers")
      .insert({
        name: company_name,
        slug,
        is_active: true,
        status: "active_pending_review",
        requested_plan,
        contact_person,
        contact_email: email,
        contact_phone: phone || null,
        signup_source: "self",
      })
      .select("id")
      .single();

    if (insurerError || !insurer?.id) {
      throw new Error(`Insurer creation failed: ${insurerError?.message ?? "no id returned"}`);
    }

    // 3. insurer_users レコード作成（初回ユーザー = admin）
    const { error: iuError } = await supabase.from("insurer_users").insert({
      insurer_id: insurer.id,
      user_id: userId,
      role: "admin",
      email,
      display_name: contact_person,
      is_active: true,
    });

    if (iuError) {
      // insurer は作れたが insurer_users が失敗 → insurer も巻き戻し
      await supabase.from("insurers").delete().eq("id", insurer.id);
      throw new Error(`Insurer user creation failed: ${iuError.message}`);
    }

    return NextResponse.json(
      {
        ok: true,
        insurer_id: insurer.id,
        user_id: userId,
      },
      { status: 201 }
    );
  } catch (e: any) {
    // Auth ユーザーが作成済みならクリーンアップ
    if (userId) {
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch {
        console.error("[insurer-register] cleanup: failed to delete auth user", userId);
      }
    }

    console.error("[insurer-register] error:", e?.message ?? e);
    return NextResponse.json(
      { error: "registration_failed", message: e?.message ?? "登録に失敗しました" },
      { status: 500 }
    );
  }
}
