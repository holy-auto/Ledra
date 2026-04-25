import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { checkOverlap } from "@/lib/reservations/overlap";
import { syncCreateEvent } from "@/lib/gcal/client";
import { sendBookingConfirmation } from "@/lib/line/client";
import { checkRateLimit } from "@/lib/api/rateLimit";

const customerBookingSchema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  customer_name: z.string().trim().min(1).max(100),
  customer_email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  customer_phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(200).optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduled_date は YYYY-MM-DD 形式です"),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です"),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です"),
  note: z.string().trim().max(2000).optional(),
});

export const dynamic = "force-dynamic";

/**
 * POST /api/customer/booking
 *
 * 顧客 Web フォームからの予約作成（API キー不要）
 * /customer/[tenant]/booking ページから呼び出す内部エンドポイント
 *
 * Body:
 *   tenant_slug: string       — 予約先テナント識別
 *   customer_name: string     — 顧客名
 *   customer_email?: string   — メールアドレス
 *   customer_phone?: string   — 電話番号
 *   title?: string            — 施工メニュー / 予約タイトル（省略時 "Web予約"）
 *   scheduled_date: string    — YYYY-MM-DD
 *   start_time: string        — HH:MM
 *   end_time: string          — HH:MM
 *   note?: string             — 備考
 */
export async function POST(req: NextRequest) {
  // レート制限（一般エンドポイントと同じ: 60 req / 60s）
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const parsed = customerBookingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data;
    const tenantSlug = body.tenant_slug;
    const customerName = body.customer_name;
    const title = body.title || "Web予約";
    const scheduledDate = body.scheduled_date;
    const startTime = body.start_time;
    const endTime = body.end_time;

    // 過去日チェック
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDate = new Date(scheduledDate + "T00:00:00");
    if (bookingDate < today) {
      return apiValidationError("過去の日付には予約できません");
    }

    const admin = createServiceRoleAdmin("public booking — looks up tenant from slug, no caller context");

    // テナント解決
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .single();

    if (!tenant) {
      return apiValidationError("指定された店舗が見つかりません");
    }

    const dayOfWeek = bookingDate.getDay();

    // ── 定休日チェック ──
    const { data: weeklyClosed } = await admin
      .from("closed_days")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("type", "weekly")
      .eq("day_of_week", dayOfWeek)
      .limit(1);

    if (weeklyClosed && weeklyClosed.length > 0) {
      return apiError({ code: "conflict", message: "この日は定休日のため予約を受け付けていません", status: 422 });
    }

    const { data: specificClosed } = await admin
      .from("closed_days")
      .select("id, note")
      .eq("tenant_id", tenant.id)
      .eq("type", "specific")
      .eq("closed_date", scheduledDate)
      .limit(1);

    if (specificClosed && specificClosed.length > 0) {
      const note = specificClosed[0].note;
      return apiError({
        code: "conflict",
        message: note
          ? `この日は休業日のため予約を受け付けていません（${note}）`
          : "この日は休業日のため予約を受け付けていません",
        status: 422,
      });
    }

    // ── スロット空き状況チェック ──
    const { data: slots } = await admin
      .from("external_booking_slots")
      .select("max_bookings")
      .eq("tenant_id", tenant.id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .lte("start_time", startTime)
      .gte("end_time", endTime)
      .limit(1);

    if (slots && slots.length > 0) {
      const maxBookings = slots[0].max_bookings;

      const { count } = await admin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("scheduled_date", scheduledDate)
        .neq("status", "cancelled")
        .lte("start_time", endTime)
        .gte("end_time", startTime);

      if ((count ?? 0) >= maxBookings) {
        return apiError({
          code: "conflict",
          message: "ご指定の時間帯は満席です。別の時間帯をお選びください。",
          status: 409,
        });
      }
    }

    // ── ダブルブッキングチェック ──
    const overlaps = await checkOverlap({
      tenantId: tenant.id,
      scheduledDate,
      startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
      endTime: endTime.length === 5 ? `${endTime}:00` : endTime,
    });

    if (overlaps.length > 0) {
      return apiError({
        code: "conflict",
        message: "ご指定の時間帯は既に予約が入っています。別の時間帯をお選びください。",
        status: 409,
      });
    }

    // ── 顧客レコード作成/取得 ──
    let customerId: string | null = null;

    if (body.customer_email) {
      const { data: existing } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("email", body.customer_email)
        .limit(1)
        .maybeSingle();

      if (existing) {
        customerId = existing.id;
      }
    }

    if (!customerId && body.customer_phone) {
      const { data: existing } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("phone", body.customer_phone)
        .limit(1)
        .maybeSingle();

      if (existing) {
        customerId = existing.id;
      }
    }

    if (!customerId) {
      const { data: newCustomer } = await admin
        .from("customers")
        .insert({
          tenant_id: tenant.id,
          name: customerName,
          email: body.customer_email || null,
          phone: body.customer_phone || null,
        })
        .select("id")
        .single();

      customerId = newCustomer?.id ?? null;
    }

    // ── 予約作成 ──
    const reservationId = crypto.randomUUID();
    const { data: reservation, error } = await admin
      .from("reservations")
      .insert({
        id: reservationId,
        tenant_id: tenant.id,
        customer_id: customerId,
        title,
        scheduled_date: scheduledDate,
        start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
        end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
        note: body.note || null,
        source: "web",
        status: "confirmed",
      })
      .select("id, tenant_id, customer_id, title, scheduled_date, start_time, end_time, note, status")
      .single();

    if (error) return apiInternalError(error, "customer booking insert");

    // ── Google Calendar 同期（非ブロッキング） ──
    syncCreateEvent(tenant.id, {
      id: reservation.id,
      title: reservation.title,
      scheduled_date: reservation.scheduled_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      note: reservation.note,
      customer_name: customerName,
    }).catch(() => {});

    return apiOk({
      reservation_id: reservation.id,
      tenant_name: tenant.name,
      scheduled_date: reservation.scheduled_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      status: "confirmed",
    });
  } catch (e) {
    return apiInternalError(e, "customer booking");
  }
}
