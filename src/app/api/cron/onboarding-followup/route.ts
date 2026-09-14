import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { sendEmail } from "@/lib/email/sendEmail";
import { buildOnboardingEmail, type OnboardingDay, type OnboardingMilestones } from "@/lib/onboardingEmails";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Onboarding Drip Email Cron
 * --------------------------
 * 毎日実行され、サインアップから 1 / 3 / 7 日後のテナントオーナーに
 * マイルストーン進捗に応じたフォローアップメールを送信する。
 *
 * 重複送信防止: tenants.created_at の日付一致でフィルタするため、
 * 各テナントは day=1, 3, 7 でちょうど 1 度ずつトリガーされる。
 * Resend Idempotency-Key も `onboarding:<tenant_id>:day<N>` で発行し、
 * 仮にクロンが二重発火しても 24h 以内なら再送されない。
 */

const FOLLOWUP_DAYS: OnboardingDay[] = [1, 3, 7];

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type TenantRow = {
  id: string;
  name: string | null;
  contact_email: string | null;
};

type MembershipRow = {
  user_id: string;
};

async function loadMilestones(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
): Promise<OnboardingMilestones> {
  const [tenantRes, vehicleRes, customerRes, certRes] = await Promise.all([
    admin
      .from("tenants")
      .select("logo_asset_path,contact_email,contact_phone,address")
      .eq("id", tenantId)
      .maybeSingle(),
    admin.from("vehicles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("certificates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  const t = tenantRes.data as Record<string, unknown> | null;
  return {
    hasShopInfo: !!(t?.contact_email || t?.contact_phone || t?.address),
    hasLogo: !!t?.logo_asset_path,
    hasCustomerOrVehicle: (vehicleRes.count ?? 0) > 0 || (customerRes.count ?? 0) > 0,
    hasFirstCertificate: (certRes.count ?? 0) > 0,
  };
}

async function resolveOwnerEmail(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenant: TenantRow,
): Promise<string | null> {
  if (tenant.contact_email && tenant.contact_email.includes("@")) return tenant.contact_email;
  // contact_email 未設定時はテナントの最初のメンバーの auth.users.email を取得
  const { data: members } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<MembershipRow[]>();
  const userId = members?.[0]?.user_id;
  if (!userId) return null;
  try {
    const { data: userRes } = await admin.auth.admin.getUserById(userId);
    return userRes?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function processDay(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  day: OnboardingDay,
): Promise<{ candidates: number; sent: number; failed: number }> {
  const target = dateNDaysAgo(day);
  // created_at の日付部分が day 日前と一致するテナントを取得
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, name, contact_email, created_at")
    .gte("created_at", `${target}T00:00:00Z`)
    .lt("created_at", `${target}T23:59:59Z`)
    .returns<(TenantRow & { created_at: string })[]>();

  const list = tenants ?? [];
  let sent = 0;
  let failed = 0;

  for (const tenant of list) {
    try {
      const email = await resolveOwnerEmail(admin, tenant);
      if (!email) continue;
      const milestones = await loadMilestones(admin, tenant.id);
      const shopName = tenant.name ?? "ご登録者";
      const { subject, html, text } = buildOnboardingEmail(day, shopName, milestones);
      const result = await sendEmail({
        to: email,
        subject,
        html,
        text,
        idempotencyKey: `onboarding:${tenant.id}:day${day}`,
      });
      if (result.ok) {
        sent++;
      } else {
        failed++;
        logger.warn("onboarding-followup: send failed", { tenantId: tenant.id, day, error: result.error });
      }
    } catch (e) {
      failed++;
      logger.warn("onboarding-followup: tenant failed", {
        tenantId: tenant.id,
        day,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { candidates: list.length, sent, failed };
}

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const supabase = createServiceRoleAdmin("cron:onboarding-followup");
    const lock = await withCronLock(supabase, "onboarding-followup", 600, async () => {
      const results: Record<string, { candidates: number; sent: number; failed: number }> = {};
      for (const day of FOLLOWUP_DAYS) {
        results[`day${day}`] = await processDay(supabase, day);
      }
      return results;
    });

    if (!lock.acquired) {
      return apiJson({ ok: true, skipped: true, reason: "lock held by another invocation" });
    }

    return apiJson({ ok: true, results: lock.value });
  } catch (e) {
    return apiInternalError(e, "cron/onboarding-followup");
  }
}
