import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { sendEmail } from "@/lib/email/sendEmail";
import { buildMonthlySummaryEmail } from "@/lib/manufacturers/monthlySummaryEmail";
import { evaluateQualityFlags } from "@/lib/manufacturers/qualityFlags";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Manufacturer Monthly Summary Cron
 * ---------------------------------
 * Runs on the 1st of each month. For every active manufacturer with at
 * least one active admin member, emails the previous calendar month's
 * KPIs (issuance, new/revoked certifications, active contractors,
 * quality flags).
 *
 * Double-send protection: Resend Idempotency-Key
 * `mfr-monthly:<manufacturer_id>:<YYYY-MM>` ensures a re-run within the
 * same month does not re-deliver. A cron lock prevents overlapping
 * executions.
 */

function previousMonthRange(now: Date): { start: string; endExclusive: string; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based, current month
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const label = `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月`;
  return {
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    label,
  };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.authorized) return apiUnauthorized(auth.error ?? "unauthorized");

  try {
    const admin = createServiceRoleAdmin(
      "cron manufacturer-monthly-summary — platform-wide aggregation across all manufacturers",
    );

    const locked = await withCronLock(admin, "manufacturer-monthly-summary", 600, async () => {
      const now = new Date();
      const { start, endExclusive, label } = previousMonthRange(now);
      const ymKey = start.slice(0, 7); // YYYY-MM for idempotency

      const portalBase =
        (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp").replace(/\/$/, "") + "/manufacturer";

      const { data: manufacturers, error: mfrErr } = await admin
        .from("manufacturers")
        .select("id, name, is_active")
        .eq("is_active", true);
      if (mfrErr) throw new Error(`manufacturers query failed: ${mfrErr.message}`);

      let sent = 0;
      let skippedNoAdmin = 0;
      let failed = 0;

      for (const mfr of manufacturers ?? []) {
        const manufacturerId = mfr.id as string;
        const manufacturerName = (mfr.name as string) ?? "メーカー";

        // Active admin members → resolve their emails.
        const { data: adminMembers } = await admin
          .from("manufacturer_memberships")
          .select("user_id")
          .eq("manufacturer_id", manufacturerId)
          .eq("role", "admin")
          .eq("is_active", true)
          .returns<{ user_id: string }[]>();
        const adminUserIds = new Set((adminMembers ?? []).map((m) => m.user_id));
        if (adminUserIds.size === 0) {
          skippedNoAdmin++;
          continue;
        }

        const recipientEmails: string[] = [];
        let page = 1;
        while (page <= 20 && recipientEmails.length < adminUserIds.size) {
          const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (!pageData?.users?.length) break;
          for (const u of pageData.users) {
            if (adminUserIds.has(u.id) && u.email) recipientEmails.push(u.email);
          }
          if (pageData.users.length < 200) break;
          page++;
        }
        if (recipientEmails.length === 0) {
          skippedNoAdmin++;
          continue;
        }

        // Stats for the previous calendar month.
        const [issuedRes, newCertRes, revokedRes, activeCertRes] = await Promise.all([
          admin
            .from("certificates")
            .select("id", { count: "exact", head: true })
            .eq("manufacturer_id", manufacturerId)
            .gte("created_at", start)
            .lt("created_at", endExclusive),
          admin
            .from("manufacturer_certified_tenants")
            .select("id", { count: "exact", head: true })
            .eq("manufacturer_id", manufacturerId)
            .gte("certified_at", start)
            .lt("certified_at", endExclusive),
          admin
            .from("manufacturer_certified_tenants")
            .select("id", { count: "exact", head: true })
            .eq("manufacturer_id", manufacturerId)
            .eq("status", "revoked")
            .gte("revoked_at", start)
            .lt("revoked_at", endExclusive),
          admin
            .from("manufacturer_certified_tenants")
            .select("id", { count: "exact", head: true })
            .eq("manufacturer_id", manufacturerId)
            .eq("status", "active"),
        ]);

        // Quality flags over the month's issuance.
        const { data: monthCerts } = await admin
          .from("certificates")
          .select(
            "id, customer_name, content_free_text, warranty_period_end, warranty_exclusions, coating_products_json, ppf_coverage_json, maintenance_json, body_repair_json",
          )
          .eq("manufacturer_id", manufacturerId)
          .eq("status", "active")
          .gte("created_at", start)
          .lt("created_at", endExclusive)
          .limit(5000)
          .returns<
            Array<{
              id: string;
              customer_name: string | null;
              content_free_text: string | null;
              warranty_period_end: string | null;
              warranty_exclusions: string | null;
              /* eslint-disable @typescript-eslint/no-explicit-any */
              coating_products_json: any;
              ppf_coverage_json: any;
              maintenance_json: any;
              body_repair_json: any;
              /* eslint-enable @typescript-eslint/no-explicit-any */
            }>
          >();

        let qualityFlagged = 0;
        if (monthCerts && monthCerts.length > 0) {
          const ids = monthCerts.map((c) => c.id);
          const imgCount = new Map<string, number>();
          const { data: imgs } = await admin
            .from("certificate_images")
            .select("certificate_id")
            .in("certificate_id", ids)
            .returns<{ certificate_id: string }[]>();
          for (const im of imgs ?? []) {
            imgCount.set(im.certificate_id, (imgCount.get(im.certificate_id) ?? 0) + 1);
          }
          for (const c of monthCerts) {
            const flags = evaluateQualityFlags({
              customer_name: c.customer_name,
              content_free_text: c.content_free_text,
              warranty_period_end: c.warranty_period_end,
              warranty_exclusions: c.warranty_exclusions,
              coating_products_json: c.coating_products_json,
              ppf_coverage_json: c.ppf_coverage_json,
              maintenance_json: c.maintenance_json,
              body_repair_json: c.body_repair_json,
              image_count: imgCount.get(c.id) ?? 0,
            });
            if (flags.length > 0) qualityFlagged++;
          }
        }

        const { subject, html } = buildMonthlySummaryEmail({
          manufacturerName,
          monthLabel: label,
          certificatesIssued: issuedRes.count ?? 0,
          newCertifications: newCertRes.count ?? 0,
          revokedCertifications: revokedRes.count ?? 0,
          activeCertifiedTenants: activeCertRes.count ?? 0,
          qualityFlaggedCount: qualityFlagged,
          portalUrl: portalBase,
        });

        const result = await sendEmail({
          to: recipientEmails,
          subject,
          html,
          idempotencyKey: `mfr-monthly:${manufacturerId}:${ymKey}`,
        });
        if (result.ok) {
          sent++;
        } else {
          failed++;
          logger.warn("manufacturer monthly summary send failed", {
            manufacturerId,
            error: result.error,
          });
        }
      }

      return {
        month: label,
        manufacturers: (manufacturers ?? []).length,
        sent,
        skipped_no_admin: skippedNoAdmin,
        failed,
      };
    });

    if (!locked.acquired) {
      return apiJson({ ok: true, skipped: "lock_not_acquired" });
    }
    return apiJson({ ok: true, ...locked.value });
  } catch (e) {
    return apiInternalError(e, "cron manufacturer-monthly-summary");
  }
}
