import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit as checkUpstashRateLimit } from "@/lib/api/rateLimit";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { agentApplicationSchema, parseBody } from "@/lib/validation/schemas";
import { notifyApplicationReceived } from "@/lib/agent/email";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/agent/apply
 *
 * 代理店申請エンドポイント。
 * 設計方針（アカウント統合対応）:
 *   - ログイン済みユーザー: セッションから user_id を取得し agents テーブルに紐付け
 *   - 未ログイン + 既存メール: auth.users に一致するレコードが存在する場合、
 *     新規 Auth ユーザー作成をスキップし、既存 user_id を agents に紐付ける
 *   - 未ログイン + 新規メール: 従来通り agent_applications に INSERT するのみ
 *     （管理者承認後に auth.users を作成するフロー）
 */
export async function POST(req: NextRequest) {
  // Rate limit: Upstash Redis (production) with in-memory fallback
  const upstashDeny = await checkUpstashRateLimit(req, "auth");
  if (upstashDeny) return upstashDeny;

  const ip = getClientIp(req);
  const rl = await checkRateLimit(`apply:${ip}`, { limit: 3, windowSec: 600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "申請回数の上限に達しました。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = parseBody(agentApplicationSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.errors }, { status: 400 });
  }

  const data = parsed.data;

  if (!data.terms_accepted) {
    return NextResponse.json({ error: "terms_required", message: "利用規約への同意が必要です" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // -----------------------------------------------------------------------
  // Step 1: ログイン済みユーザーかどうかを確認
  // -----------------------------------------------------------------------
  let currentUserId: string | null = null;
  try {
    const serverClient = await createClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (user) {
      currentUserId = user.id;
    }
  } catch {
    // 未ログイン or セッション取得失敗はスキップ
  }

  // -----------------------------------------------------------------------
  // Step 2: ログイン済みでなければ、メールで auth.users を検索
  // -----------------------------------------------------------------------
  if (!currentUserId) {
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const matchedUser = existingUsers?.users?.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (matchedUser) {
      currentUserId = matchedUser.id;
    }
  }

  // -----------------------------------------------------------------------
  // Step 3: すでに代理店として登録済みでないか確認（agent_users テーブルで確認）
  // -----------------------------------------------------------------------
  if (currentUserId) {
    const { data: existingAgentUser } = await adminClient
      .from("agent_users")
      .select("agent_id, agents(id, status)")
      .eq("user_id", currentUserId)
      .eq("is_active", true)
      .maybeSingle();

    if (existingAgentUser) {
      const agentStatus = (existingAgentUser.agents as { status?: string } | null)?.status;
      return NextResponse.json(
        {
          error: "already_registered",
          message: "このアカウントはすでに代理店として登録されています。",
          agent_status: agentStatus,
        },
        { status: 409 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 4: 申請番号を生成して agent_applications に INSERT
  // -----------------------------------------------------------------------
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hex4 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const applicationNumber = `AGT-${dateStr}-${hex4}`;

  const insertPayload = {
    application_number: applicationNumber,
    company_name: data.company_name,
    contact_name: data.contact_name,
    email: data.email,
    phone: data.phone,
    address: data.address,
    industry: data.industry,
    qualifications: data.qualifications,
    track_record: data.track_record,
    documents: data.documents,
    status: "submitted",
    ip_address: ip,
    user_agent: req.headers.get("user-agent") || "",
    // 既存ユーザーが判明している場合は user_id を保存
    ...(currentUserId ? { user_id: currentUserId } : {}),
  };

  const { error } = await adminClient.from("agent_applications").insert(insertPayload);

  if (error) {
    console.error("[agent/apply] insert error:", error.message);

    // Retry with new application number on unique constraint violation
    if (error.code === "23505") {
      const hex4b = crypto.randomBytes(2).toString("hex").toUpperCase();
      const retryNumber = `AGT-${dateStr}-${hex4b}`;
      const { error: retryError } = await adminClient.from("agent_applications").insert({
        ...insertPayload,
        application_number: retryNumber,
      });
      if (!retryError) {
        await notifyApplicationReceived(data.email, {
          companyName: data.company_name,
          applicationNumber: retryNumber,
        }).catch((e) => console.error("[agent/apply] email error:", e));
        return NextResponse.json(
          {
            ok: true,
            application_number: retryNumber,
            linked_existing_account: !!currentUserId,
          },
          { status: 201 },
        );
      }
    }

    return NextResponse.json(
      { error: "submission_failed", message: "申請の送信に失敗しました。しばらくしてから再度お試しください。" },
      { status: 500 },
    );
  }

  // Send confirmation email (fire-and-forget)
  await notifyApplicationReceived(data.email, {
    companyName: data.company_name,
    applicationNumber: applicationNumber,
  }).catch((e) => console.error("[agent/apply] email error:", e));

  return NextResponse.json(
    {
      ok: true,
      application_number: applicationNumber,
      // フロントエンドに「既存アカウントに紐付けられた」ことを伝える
      linked_existing_account: !!currentUserId,
    },
    { status: 201 },
  );
}
