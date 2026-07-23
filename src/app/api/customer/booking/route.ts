import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { checkOverlap } from "@/lib/reservations/overlap";
import { syncCreateEvent } from "@/lib/gcal/client";
import { sendBookingConfirmation } from "@/lib/line/client";
import { notifyNewBooking } from "@/lib/notifications/bookingNotify";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";
import { createIntakeInvitation } from "@/lib/identity/intakeServer";

const customerBookingSchema = z
  .object({
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
    // 希望作業の大カテゴリ。指定時、その枠が受け入れるか検証する。
    category: z.string().trim().max(80).optional(),
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduled_date は YYYY-MM-DD 形式です"),
    // 終日予約（1日お預かり）。true のとき start_time / end_time は不要。
    all_day: z.boolean().optional(),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です")
      .optional(),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です")
      .optional(),
    note: z.string().trim().max(2000).optional(),
    /**
     * true なら予約と同時に事前カルテ用 intake invitation を発行し、
     * URL / short_id をレスポンスに含める。Booking page で「事前カルテも記入する」
     * UI を表示するために使う。
     */
    request_intake: z.boolean().optional(),
  })
  .refine((d) => d.all_day === true || (!!d.start_time && !!d.end_time), {
    message: "start_time / end_time は必須です（終日予約を除く）",
    path: ["start_time"],
  });

export const dynamic = "force-dynamic";

// 終日予約の占有時間帯（ダブルブッキング判定用）。営業日を丸ごと押さえる。
// ponytail: 24時間制の店舗を想定しない前提。深夜跨ぎ営業が要件化したら要見直し。
const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";

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
    // 希望作業カテゴリが選ばれていればタイトルに反映し、店舗側でどの作業の予約か分かるようにする。
    const title = body.title || body.category || "Web予約";
    const scheduledDate = body.scheduled_date;
    const isAllDay = body.all_day === true;
    const startTime = body.start_time;
    const endTime = body.end_time;
    // ダブルブッキング判定に使う時間帯（終日は営業日を丸ごと押さえる）。
    const overlapStart = isAllDay ? ALL_DAY_START : startTime!;
    const overlapEnd = isAllDay ? ALL_DAY_END : endTime!;

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

    // ── スロット空き状況チェック（終日予約は特定枠を持たないためスキップ） ──
    const { data: slots } = isAllDay
      ? { data: null }
      : await admin
          .from("external_booking_slots")
          .select("max_bookings, accepted_categories")
          .eq("tenant_id", tenant.id)
          .eq("day_of_week", dayOfWeek)
          .eq("is_active", true)
          .lte("start_time", startTime)
          .gte("end_time", endTime)
          .limit(1);

    if (!isAllDay && slots && slots.length > 0) {
      const maxBookings = slots[0].max_bookings;

      // 受入可否: 受入カテゴリが設定された枠は、一致する希望作業カテゴリの指定を必須にする。
      // 指定なし/不一致はいずれも拒否（受入未設定=すべて受入）。
      const accepted = slots[0].accepted_categories as string[] | null;
      if (accepted && accepted.length > 0 && (!body.category || !accepted.includes(body.category))) {
        return apiError({
          code: "conflict",
          message: `この時間帯は「${accepted.join("・")}」のみ受け付けています。ご希望の作業をお選びください。`,
          status: 422,
        });
      }

      // 境界は排他（開始=前枠の終了 は重複としない）。空き状況 GET と揃え、隣接枠を
      // 独立して予約可能にする。取引先の有効な仮押さえ(reservation_holds)も占有として
      // 数え、押さえ枠に一般客予約が入る（オーバーセル）のを防ぐ。
      const [{ count }, { count: heldCount }] = await Promise.all([
        admin
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("scheduled_date", scheduledDate)
          .neq("status", "cancelled")
          .lt("start_time", endTime)
          .gt("end_time", startTime),
        admin
          .from("reservation_holds")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("scheduled_date", scheduledDate)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .lt("start_time", endTime)
          .gt("end_time", startTime),
      ]);

      if ((count ?? 0) + (heldCount ?? 0) >= maxBookings) {
        return apiError({
          code: "conflict",
          message: "ご指定の時間帯は満席です。別の時間帯をお選びください。",
          status: 409,
        });
      }
    }

    // ── ダブルブッキングチェック ──
    // 終日予約は営業日全体、通常予約は指定時間帯で判定。RPC 側で終日予約(all_day)は
    // どの時間帯とも競合するため、終日 vs 通常 / 終日 vs 終日 も検出される。
    const overlaps = await checkOverlap({
      tenantId: tenant.id,
      scheduledDate,
      startTime: overlapStart.length === 5 ? `${overlapStart}:00` : overlapStart,
      endTime: overlapEnd.length === 5 ? `${overlapEnd}:00` : overlapEnd,
    });

    if (overlaps.length > 0) {
      return apiError({
        code: "conflict",
        message: isAllDay
          ? "この日は既に予約が入っているため終日予約を承れません。別の日をお選びください。"
          : "ご指定の時間帯は既に予約が入っています。別の時間帯をお選びください。",
        status: 409,
      });
    }

    // 終日予約は、取引先の有効な仮押さえが当日に1件でもあれば承れない（押さえ枠と併存不可）。
    // 時間枠予約は上のスロット容量チェックで仮押さえを加味済み。
    if (isAllDay) {
      const { count: heldCount } = await admin
        .from("reservation_holds")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("scheduled_date", scheduledDate)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());
      if ((heldCount ?? 0) > 0) {
        return apiError({
          code: "conflict",
          message: "この日は既に枠が押さえられているため終日予約を承れません。別の日をお選びください。",
          status: 409,
        });
      }
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
        all_day: isAllDay,
        start_time: isAllDay ? null : startTime!.length === 5 ? `${startTime}:00` : startTime,
        end_time: isAllDay ? null : endTime!.length === 5 ? `${endTime}:00` : endTime,
        note: body.note || null,
        source: "web",
        status: "confirmed",
      })
      .select("id, tenant_id, customer_id, title, scheduled_date, all_day, start_time, end_time, note, status")
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
    }).catch((error) => {
      logger.warn("google calendar sync failed (non-blocking)", {
        error,
        tenantId: tenant.id,
        reservationId: reservation.id,
      });
    });

    // ── 予約通知（メール/Slack、非ブロッキング） ──
    notifyNewBooking(
      tenant.id,
      {
        id: reservation.id,
        title: reservation.title,
        scheduled_date: reservation.scheduled_date,
        all_day: reservation.all_day,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        note: reservation.note,
        tenant_name: tenant.name,
      },
      customerName,
    ).catch((error) => {
      logger.warn("booking notify failed (non-blocking)", {
        error,
        tenantId: tenant.id,
        reservationId: reservation.id,
      });
    });

    // 事前カルテ (intake invitation) を併発する
    let intake: { url: string; short_id: string; expires_at: string } | null = null;
    if (body.request_intake) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
        const created = await createIntakeInvitation({
          tenantId: tenant.id,
          storeId: null,
          label: `${customerName} 様 事前カルテ (予約 ${scheduledDate})`,
          contactEmail: body.customer_email ?? null,
          contactPhone: body.customer_phone ?? null,
          createdBy: null, // 公開フローには auth.users 側の caller がいないため null
          baseUrl,
        });
        intake = { url: created.url, short_id: created.shortId, expires_at: created.expiresAt };
      } catch (intakeErr) {
        // intake 発行失敗は予約成立を阻まない (best-effort)
        logger.warn("intake_invite_after_booking_failed", {
          error: intakeErr instanceof Error ? intakeErr.message : String(intakeErr),
          tenantId: tenant.id,
          reservationId: reservation.id,
        });
      }
    }

    return apiOk({
      reservation_id: reservation.id,
      tenant_name: tenant.name,
      scheduled_date: reservation.scheduled_date,
      all_day: reservation.all_day,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      status: "confirmed",
      intake,
    });
  } catch (e) {
    return apiInternalError(e, "customer booking");
  }
}
