import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { checkOverlap } from "@/lib/reservations/overlap";
import { syncCreateEvent } from "@/lib/gcal/client";
import { sendBookingConfirmation } from "@/lib/line/client";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/external/booking
 *
 * 外部予約受付 API（Google Maps Reserve with Google / LINE LIFF / Webフォーム等）
 * API Key 認証（テナントごとに発行）
 *
 * Body:
 *   tenant_slug: string       — 予約先テナント識別
 *   customer_name: string     — 顧客名
 *   customer_email?: string   — メールアドレス
 *   customer_phone?: string   — 電話番号
 *   line_user_id?: string     — LINE user ID
 *   title: string             — 施工メニュー / 予約タイトル
 *   scheduled_date: string    — YYYY-MM-DD
 *   start_time: string        — HH:MM
 *   end_time: string          — HH:MM
 *   note?: string             — 備考
 *   source: "google_maps" | "line" | "web"
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));

    // 必須フィールド検証
    const tenantSlug = body?.tenant_slug;
    const customerName = body?.customer_name;
    const title = body?.title;
    const scheduledDate = body?.scheduled_date;
    const startTime = body?.start_time;
    const endTime = body?.end_time;

    if (!tenantSlug || !customerName || !title || !scheduledDate || !startTime || !endTime) {
      return apiValidationError(
        "tenant_slug, customer_name, title, scheduled_date, start_time, end_time は必須です"
      );
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return apiValidationError("scheduled_date は YYYY-MM-DD 形式です");
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)) {
      return apiValidationError("start_time / end_time は HH:MM 形式です");
    }

    const admin = getAdminClient();

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

    // ── スロット空き状況チェック ──
    const dayOfWeek = new Date(scheduledDate).getDay();
    const { data: slots } = await admin
      .from("external_booking_slots")
      .select("max_bookings")
      .eq("tenant_id", tenant.id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .lte("start_time", startTime)
      .gte("end_time", endTime)
      .limit(1);

    // スロットが定義されていない場合はデフォルトで受付可能（ただし重複チェックはする）
    if (slots && slots.length > 0) {
      const maxBookings = slots[0].max_bookings;

      // 同時間帯の既存予約数
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
    if (body.line_user_id) {
      // LINE user_id で既存顧客検索
      const { data: existing } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("line_user_id", body.line_user_id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        customerId = existing.id;
      }
    }

    if (!customerId && body.customer_email) {
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

    if (!customerId) {
      // 新規顧客作成
      const { data: newCustomer } = await admin
        .from("customers")
        .insert({
          tenant_id: tenant.id,
          name: customerName,
          email: body.customer_email || null,
          phone: body.customer_phone || null,
          line_user_id: body.line_user_id || null,
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
        source: body.source || "web",
        line_user_id: body.line_user_id || null,
        status: "confirmed",
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "external booking insert");

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

    // ── LINE 予約確認通知（非ブロッキング） ──
    if (body.line_user_id) {
      sendBookingConfirmation(tenant.id, body.line_user_id, {
        title: reservation.title,
        scheduled_date: reservation.scheduled_date,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        tenant_name: tenant.name,
      }).catch(() => {});
    }

    return apiOk({
      reservation_id: reservation.id,
      tenant_name: tenant.name,
      scheduled_date: reservation.scheduled_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      status: "confirmed",
    });
  } catch (e) {
    return apiInternalError(e, "external booking");
  }
}

/**
 * GET /api/external/booking?tenant_slug=xxx&date=YYYY-MM-DD
 * 空きスロット一覧を返す（外部予約フォーム用）
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenant_slug");
    const date = url.searchParams.get("date");

    if (!tenantSlug || !date) {
      return apiValidationError("tenant_slug と date (YYYY-MM-DD) が必要です");
    }

    const admin = getAdminClient();

    const { data: tenant } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .single();

    if (!tenant) {
      return apiValidationError("指定された店舗が見つかりません");
    }

    const dayOfWeek = new Date(date).getDay();

    // スロット定義を取得
    const { data: slots } = await admin
      .from("external_booking_slots")
      .select("start_time, end_time, max_bookings")
      .eq("tenant_id", tenant.id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .order("start_time");

    if (!slots || slots.length === 0) {
      return apiOk({ date, slots: [], message: "この日の予約枠は設定されていません" });
    }

    // 既存予約を取得
    const { data: reservations } = await admin
      .from("reservations")
      .select("start_time, end_time")
      .eq("tenant_id", tenant.id)
      .eq("scheduled_date", date)
      .neq("status", "cancelled");

    const available = slots.map((slot: any) => {
      const booked = (reservations ?? []).filter((r: any) =>
        r.start_time < slot.end_time && r.end_time > slot.start_time
      ).length;

      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        available: Math.max(0, slot.max_bookings - booked),
        max: slot.max_bookings,
      };
    });

    return apiOk({ date, slots: available });
  } catch (e) {
    return apiInternalError(e, "available slots");
  }
}
