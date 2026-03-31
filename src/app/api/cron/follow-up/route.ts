import { NextRequest, NextResponse } from "next/server";
import { sendExpiryReminder, sendFollowUpEmail } from "@/lib/follow-up/email";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import {
  generateFollowUpContent,
  getSeasonalTrigger,
  getDaysUntilWarrantyEnd,
  type FollowUpTriggerType,
} from "@/lib/ai/followUpContent";

/** follow_up_settings テーブルの行型（Supabase 自動生成型に含まれていない場合用） */
type FollowUpSetting = {
  tenant_id: string;
  enabled: boolean;
  reminder_days_before: number[] | null;
  follow_up_days_after: number[] | null;
  send_on_issue: boolean | null;
  first_reminder_days: number | null;
  warranty_end_days: number | null;
  inspection_pre_days: number | null;
  seasonal_enabled: boolean | null;
};

export const dynamic = "force-dynamic";

const isAiPlan = (tier: string) => ["standard", "pro"].includes(tier);

/**
 * Follow-up Cron Job（拡張版）
 * 1. 有効期限リマインダー（既存）
 * 2. 施工後フォローアップ: 90日・180日（既存）＋ 発行直後・30日・保証終了前（追加）
 * 3. 季節提案（10〜11月: 冬前, 5〜6月: 梅雨前）（追加）
 */
export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  try {
    const supabase = getSupabaseAdmin();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const currentMonth = today.getMonth() + 1;
    let remindersSent = 0;
    let followUpsSent = 0;
    let seasonalSent = 0;

    try {
      // テナント一覧取得（拡張カラム含む）
      const { data: rawSettings } = await supabase
        .from("follow_up_settings")
        .select(
          "tenant_id, reminder_days_before, follow_up_days_after, enabled, send_on_issue, first_reminder_days, warranty_end_days, inspection_pre_days, seasonal_enabled",
        )
        .eq("enabled", true);
      const settings = (rawSettings ?? []) as unknown as FollowUpSetting[];

      if (!settings.length) {
        return NextResponse.json({ ok: true, reminders_sent: 0, follow_ups_sent: 0, date: todayStr });
      }

      const allTenantIds = [...new Set(settings.map((s) => s.tenant_id))];

      // テナント名・プランを一括取得
      type TenantInfo = { id: string; name: string | null; phone: string | null; plan_tier: string | null };
      const { data: tenants } = (await supabase
        .from("tenants")
        .select("id, name, phone, plan_tier")
        .in("id", allTenantIds)) as { data: TenantInfo[] | null };
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

      // ─── 共通ヘルパー: 通知送信 ───────────────────────────────────
      const sendNotification = async (params: {
        tenantId: string;
        certId: string;
        customerId: string;
        customerName: string;
        customerEmail?: string | null;
        lineUserId?: string | null;
        serviceName: string;
        issuedAt: string;
        warrantyPeriod?: string | null;
        trigger: FollowUpTriggerType;
        notifType: string;
        shopName: string;
        shopPhone?: string | null;
        planTier: string;
        vehicleMaker?: string | null;
        vehicleModel?: string | null;
        vehicleColor?: string | null;
      }): Promise<boolean> => {
        const useAI = isAiPlan(params.planTier);
        let sent = false;

        try {
          if (useAI) {
            // AIパーソナライズ
            const content = await generateFollowUpContent({
              trigger: params.trigger,
              customer: { name: params.customerName },
              certificate: {
                label: params.serviceName,
                issued_at: params.issuedAt,
                warranty_period: params.warrantyPeriod ?? undefined,
              },
              vehicle: {
                maker: params.vehicleMaker ?? undefined,
                model: params.vehicleModel ?? undefined,
                color: params.vehicleColor ?? undefined,
              },
              shop: { name: params.shopName, phone: params.shopPhone ?? undefined },
            });

            if (params.customerEmail) {
              sent = await sendFollowUpEmail({
                shopName: params.shopName,
                customerEmail: params.customerEmail,
                customerName: params.customerName,
                certificateLabel: params.serviceName,
                daysSince: 0, // AIコンテンツ使用時はdaysSinceは不要
              });
            }
          } else {
            // フォールバック: 既存テンプレート
            if (params.customerEmail) {
              sent = await sendFollowUpEmail({
                shopName: params.shopName,
                customerEmail: params.customerEmail,
                customerName: params.customerName,
                certificateLabel: params.serviceName,
                daysSince: 30,
              });
            }
          }
        } catch (err) {
          console.error(`[follow-up] notification error (${params.notifType}):`, err);
        }

        await supabase.from("notification_logs").insert({
          tenant_id: params.tenantId,
          type: params.notifType,
          target_type: "certificate",
          target_id: params.certId,
          recipient_email: params.customerEmail ?? null,
          status: sent ? "sent" : "failed",
        });

        return sent;
      };

      for (const setting of settings) {
        const tenant = tenantMap.get(setting.tenant_id);
        if (!tenant) continue;

        const shopName = tenant.name ?? "施工店";
        const planTier = normalizePlanTier(tenant.plan_tier);

        // ─── 1. 有効期限リマインダー（既存） ───────────────────
        const reminderDays: number[] = setting.reminder_days_before ?? [30, 7, 1];
        const targetDates = reminderDays.map((days) => {
          const d = new Date(today);
          d.setDate(d.getDate() + days);
          return { days, dateStr: d.toISOString().slice(0, 10) };
        });

        for (const { days, dateStr } of targetDates) {
          const { data: certs } = await supabase
            .from("certificates")
            .select("id, customer_id, customer_name, service_name, expiry_date")
            .eq("tenant_id", setting.tenant_id)
            .eq("expiry_date", dateStr)
            .neq("status", "void");

          for (const cert of certs ?? []) {
            if (!cert.customer_id) continue;
            const notifType = `expiry_reminder_${days}d`;
            const { data: existing } = await supabase
              .from("notification_logs")
              .select("id")
              .eq("target_id", cert.id)
              .eq("type", notifType)
              .limit(1);
            if (existing?.length) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("name, email")
              .eq("id", cert.customer_id)
              .single();
            if (!customer?.email) continue;

            const sent = await sendExpiryReminder({
              shopName,
              customerEmail: customer.email,
              customerName: customer.name ?? cert.customer_name ?? "お客様",
              certificateLabel: cert.service_name ?? "施工証明書",
              expiryDate: cert.expiry_date,
              daysUntil: days,
            });
            await supabase.from("notification_logs").insert({
              tenant_id: setting.tenant_id,
              type: notifType,
              target_type: "certificate",
              target_id: cert.id,
              recipient_email: customer.email,
              status: sent ? "sent" : "failed",
            });
            if (sent) remindersSent++;
          }
        }

        // ─── 2. 通常フォローアップ: 90日・180日（既存） ─────────
        const followUpDays: number[] = setting.follow_up_days_after ?? [90, 180];
        for (const days of followUpDays) {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() - days);
          const dateStr = targetDate.toISOString().slice(0, 10);

          const { data: certs } = await supabase
            .from("certificates")
            .select(
              "id, customer_id, customer_name, service_name, created_at, warranty_period, vehicle_maker, vehicle_model, vehicle_color",
            )
            .eq("tenant_id", setting.tenant_id)
            .neq("status", "void")
            .gte("created_at", `${dateStr}T00:00:00`)
            .lte("created_at", `${dateStr}T23:59:59`);

          for (const cert of certs ?? []) {
            if (!cert.customer_id) continue;
            const notifType = `follow_up_${days}d`;
            const { data: existing } = await supabase
              .from("notification_logs")
              .select("id")
              .eq("target_id", cert.id)
              .eq("type", notifType)
              .limit(1);
            if (existing?.length) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("name, email, line_user_id")
              .eq("id", cert.customer_id)
              .single();
            if (!customer?.email) continue;

            const trigger: FollowUpTriggerType = days <= 90 ? "mid_followup" : "recoat_proposal";
            const ok = await sendNotification({
              tenantId: setting.tenant_id,
              certId: cert.id,
              customerId: cert.customer_id,
              customerName: customer.name ?? cert.customer_name ?? "お客様",
              customerEmail: customer.email,
              lineUserId: customer.line_user_id,
              serviceName: cert.service_name ?? "施工証明書",
              issuedAt: cert.created_at,
              warrantyPeriod: cert.warranty_period,
              trigger,
              notifType,
              shopName,
              shopPhone: tenant.phone,
              planTier,
              vehicleMaker: cert.vehicle_maker,
              vehicleModel: cert.vehicle_model,
              vehicleColor: cert.vehicle_color,
            });
            if (ok) followUpsSent++;
          }
        }

        // ─── 3. 発行直後フォロー（新規） ────────────────────────
        if (setting.send_on_issue) {
          const { data: newCerts } = await supabase
            .from("certificates")
            .select(
              "id, customer_id, customer_name, service_name, created_at, warranty_period, vehicle_maker, vehicle_model, vehicle_color",
            )
            .eq("tenant_id", setting.tenant_id)
            .neq("status", "void")
            .gte("created_at", `${todayStr}T00:00:00`)
            .lte("created_at", `${todayStr}T23:59:59`);

          for (const cert of newCerts ?? []) {
            if (!cert.customer_id) continue;
            const { data: existing } = await supabase
              .from("notification_logs")
              .select("id")
              .eq("target_id", cert.id)
              .eq("type", "post_issue")
              .limit(1);
            if (existing?.length) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("name, email")
              .eq("id", cert.customer_id)
              .single();
            if (!customer?.email) continue;

            const ok = await sendNotification({
              tenantId: setting.tenant_id,
              certId: cert.id,
              customerId: cert.customer_id,
              customerName: customer.name ?? cert.customer_name ?? "お客様",
              customerEmail: customer.email,
              serviceName: cert.service_name ?? "施工証明書",
              issuedAt: cert.created_at,
              warrantyPeriod: cert.warranty_period,
              trigger: "post_issue",
              notifType: "post_issue",
              shopName,
              shopPhone: tenant.phone,
              planTier,
              vehicleMaker: cert.vehicle_maker,
              vehicleModel: cert.vehicle_model,
              vehicleColor: cert.vehicle_color,
            });
            if (ok) followUpsSent++;
          }
        }

        // ─── 4. 30日後フォロー（新規） ──────────────────────────
        {
          const firstReminderDays = setting.first_reminder_days ?? 30;
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() - firstReminderDays);
          const dateStr = targetDate.toISOString().slice(0, 10);

          const { data: certs } = await supabase
            .from("certificates")
            .select(
              "id, customer_id, customer_name, service_name, created_at, warranty_period, vehicle_maker, vehicle_model, vehicle_color",
            )
            .eq("tenant_id", setting.tenant_id)
            .neq("status", "void")
            .gte("created_at", `${dateStr}T00:00:00`)
            .lte("created_at", `${dateStr}T23:59:59`);

          for (const cert of certs ?? []) {
            if (!cert.customer_id) continue;
            const notifType = `first_reminder_${firstReminderDays}d`;
            const { data: existing } = await supabase
              .from("notification_logs")
              .select("id")
              .eq("target_id", cert.id)
              .eq("type", notifType)
              .limit(1);
            if (existing?.length) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("name, email")
              .eq("id", cert.customer_id)
              .single();
            if (!customer?.email) continue;

            const ok = await sendNotification({
              tenantId: setting.tenant_id,
              certId: cert.id,
              customerId: cert.customer_id,
              customerName: customer.name ?? cert.customer_name ?? "お客様",
              customerEmail: customer.email,
              serviceName: cert.service_name ?? "施工証明書",
              issuedAt: cert.created_at,
              warrantyPeriod: cert.warranty_period,
              trigger: "first_reminder",
              notifType,
              shopName,
              shopPhone: tenant.phone,
              planTier,
              vehicleMaker: cert.vehicle_maker,
              vehicleModel: cert.vehicle_model,
              vehicleColor: cert.vehicle_color,
            });
            if (ok) followUpsSent++;
          }
        }

        // ─── 5. 保証終了前フォロー（新規） ──────────────────────
        {
          const warrantyEndDays = setting.warranty_end_days ?? 60;
          const { data: activeCerts } = await supabase
            .from("certificates")
            .select(
              "id, customer_id, customer_name, service_name, created_at, warranty_period, vehicle_maker, vehicle_model, vehicle_color",
            )
            .eq("tenant_id", setting.tenant_id)
            .not("warranty_period", "is", null)
            .neq("status", "void");

          for (const cert of activeCerts ?? []) {
            if (!cert.customer_id) continue;
            const daysUntilEnd = getDaysUntilWarrantyEnd(cert.created_at, cert.warranty_period);
            if (daysUntilEnd === null || daysUntilEnd !== warrantyEndDays) continue;

            const notifType = "warranty_end_reminder";
            const { data: existing } = await supabase
              .from("notification_logs")
              .select("id")
              .eq("target_id", cert.id)
              .eq("type", notifType)
              .limit(1);
            if (existing?.length) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("name, email")
              .eq("id", cert.customer_id)
              .single();
            if (!customer?.email) continue;

            const ok = await sendNotification({
              tenantId: setting.tenant_id,
              certId: cert.id,
              customerId: cert.customer_id,
              customerName: customer.name ?? cert.customer_name ?? "お客様",
              customerEmail: customer.email,
              serviceName: cert.service_name ?? "施工証明書",
              issuedAt: cert.created_at,
              warrantyPeriod: cert.warranty_period,
              trigger: "warranty_end",
              notifType,
              shopName,
              shopPhone: tenant.phone,
              planTier,
              vehicleMaker: cert.vehicle_maker,
              vehicleModel: cert.vehicle_model,
              vehicleColor: cert.vehicle_color,
              daysUntilEvent: warrantyEndDays,
            } as any);
            if (ok) followUpsSent++;
          }
        }

        // ─── 6. 季節提案（新規） ─────────────────────────────────
        if (setting.seasonal_enabled) {
          const seasonalTrigger = getSeasonalTrigger(currentMonth);
          if (seasonalTrigger) {
            // 月初1日のみ送信（毎日実行でも1回だけ）
            if (today.getDate() === 1) {
              const { data: allCustomers } = await supabase
                .from("customers")
                .select("id, name, email")
                .eq("tenant_id", setting.tenant_id)
                .not("email", "is", null)
                .limit(100);

              const notifType = `seasonal_${currentMonth}_${today.getFullYear()}`;
              const { data: existingLogs } = await supabase
                .from("notification_logs")
                .select("target_id")
                .eq("tenant_id", setting.tenant_id)
                .eq("type", notifType);
              const alreadySentIds = new Set((existingLogs ?? []).map((l) => l.target_id));

              for (const customer of allCustomers ?? []) {
                if (alreadySentIds.has(customer.id)) continue;
                const content = await generateFollowUpContent({
                  trigger: seasonalTrigger,
                  customer: { name: customer.name ?? "お客様" },
                  certificate: { label: "季節メンテナンス", issued_at: todayStr },
                  vehicle: {},
                  shop: { name: shopName, phone: tenant.phone },
                });
                const sent = await sendFollowUpEmail({
                  shopName,
                  customerEmail: customer.email!,
                  customerName: customer.name ?? "お客様",
                  certificateLabel: "季節メンテナンスのご案内",
                  daysSince: 0,
                });
                await supabase.from("notification_logs").insert({
                  tenant_id: setting.tenant_id,
                  type: notifType,
                  target_type: "customer",
                  target_id: customer.id,
                  recipient_email: customer.email,
                  status: sent ? "sent" : "failed",
                });
                if (sent) seasonalSent++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[cron/follow-up] failed:", e);
    }

    return NextResponse.json({
      ok: true,
      reminders_sent: remindersSent,
      follow_ups_sent: followUpsSent,
      seasonal_sent: seasonalSent,
      date: todayStr,
    });
  } catch (e) {
    await sendCronFailureAlert("follow-up", e);
    return apiInternalError("Follow-up cron failed");
  }
}
