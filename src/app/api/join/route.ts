import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { joinSchema, parseBody } from "@/lib/validation/schemas";

export const runtime = "nodejs";

function slugify(name: string): string {
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

export async function POST(req: Request) {
  // Rate limit: 3 registration attempts per IP per 10 minutes
  const ip = getClientIp(req);
  const rl = checkRateLimit(`join:${ip}`, { limit: 3, windowSec: 600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "登録リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // --- Zod validation ---
  const parsed = parseBody(joinSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.errors }, { status: 400 });
  }

  const { company_name, contact_person, email, phone, password, requested_plan } = parsed.data;

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
