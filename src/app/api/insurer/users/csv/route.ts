import { NextResponse } from "next/server";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

type CsvRow = {
  email: string;
  role: "admin" | "viewer" | "auditor";
  display_name: string | null;
};

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitLine = (l: string) => {
    return l.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
  };

  let start = 0;
  const head = splitLine(lines[0]).map((x) => x.toLowerCase());
  if (head[0] === "email" && head[1] === "role") start = 1;

  const out: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const email = normalizeEmail(cols[0] || "");
    const role = (cols[1] || "").toLowerCase() as CsvRow["role"];
    const display = (cols[2] || "").trim();
    if (!email) throw new Error(`CSV parse error: empty email at line ${i + 1}`);
    if (!["admin", "viewer", "auditor"].includes(role)) {
      throw new Error(`CSV parse error: invalid role "${cols[1] || ""}" at line ${i + 1}`);
    }
    out.push({
      email,
      role,
      display_name: display ? display : null,
    });
  }
  return out;
}

/**
 * Send invitation email via Resend
 */
async function sendInviteEmail(to: string, companyName: string) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!apiKey || !from) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">Ledraへの招待</h2>
      </div>
      <p style="color: #1d1d1f; line-height: 1.6;">
        ${companyName} より、Ledra加盟店ポータルへ招待されました。<br>
        以下のリンクからパスワードを設定し、ご利用を開始してください。
      </p>
      <p style="margin: 24px 0;">
        <a href="${baseUrl}/insurer/forgot-password" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          パスワードを設定する
        </a>
      </p>
      <p style="color: #86868b; font-size: 13px;">
        心当たりのない場合は、このメールを無視してください。
      </p>
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra — 株式会社HOLY AUTO
      </div>
    </div>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `【Ledra】${companyName} から招待されました`,
        html,
      }),
    });
  } catch (e) {
    console.error("[insurer-csv] invite email failed:", to, e);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    if (caller.role !== "admin") return apiForbidden("管理者のみユーザー一括登録が可能です。");

    const planDeny = enforceInsurerPlan(caller, "pro");
    if (planDeny) return planDeny;

    const { admin: adminSb } = createInsurerScopedAdmin(caller.insurerId);

    // Check max_users limit before processing
    const { INSURER_PLAN_FEATURES } = await import("@/types/insurer");
    const maxUsers = INSURER_PLAN_FEATURES[caller.planTier]?.max_users ?? 3;

    const { count: currentCount } = await adminSb
      .from("insurer_users")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true);

    // Get insurer name for invite emails
    const { data: insurerData } = await adminSb.from("insurers").select("name").eq("id", caller.insurerId).single();
    const companyName = insurerData?.name ?? "Ledra加盟店";

    // CSV読み込み
    const body = await req.text();
    let rows: CsvRow[];
    try {
      rows = parseCsv(body);
    } catch (e) {
      return apiValidationError(e instanceof Error ? e.message : String(e));
    }

    if (rows.length === 0) {
      return apiJson({ ok: true, inserted: 0, invited: 0, existing_auth: 0, errors: [] });
    }

    // Validate that adding these users won't exceed max_users
    const remainingSlots = maxUsers - (currentCount ?? 0);
    if (rows.length > remainingSlots) {
      return apiValidationError(
        `ユーザー上限を超過します。現在 ${currentCount ?? 0} 名 / 上限 ${maxUsers} 名。追加可能: ${Math.max(0, remainingSlots)} 名`,
        { current: currentCount ?? 0, max: maxUsers, requested: rows.length },
      );
    }

    let invited = 0;
    let existingAuth = 0;
    let upserted = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const r of rows) {
      try {
        const email = r.email;

        // Try to invite user (creates auth user + sends Supabase invite email)
        const inviteResult = await adminSb.auth.admin.inviteUserByEmail(email, {
          data: { display_name: r.display_name ?? undefined },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp"}/insurer/reset-password`,
        });

        if (inviteResult.error) {
          const msg = inviteResult.error.message?.toLowerCase() ?? "";
          if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
            existingAuth++;
          } else {
            throw new Error(`inviteUser failed: ${inviteResult.error.message || "unknown"}`);
          }
        } else {
          invited++;
          // Send custom invite email with company name
          sendInviteEmail(email, companyName);
        }

        const { error: upErr } = await adminSb.rpc("upsert_insurer_user", {
          p_insurer_id: caller.insurerId,
          p_email: email,
          p_role: r.role,
          p_display_name: r.display_name,
        });

        if (upErr) throw new Error(`upsert_insurer_user failed: ${upErr.message}`);
        upserted++;
      } catch (e) {
        errors.push({ email: r.email, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return apiJson({
      ok: errors.length === 0,
      insurer_id: caller.insurerId,
      total: rows.length,
      upserted,
      invited,
      existing_auth: existingAuth,
      errors,
    });
  } catch (e) {
    return apiInternalError(e, "insurer users csv import");
  }
}
