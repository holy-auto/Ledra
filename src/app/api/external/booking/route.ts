import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { checkOverlap } from "@/lib/reservations/overlap";
import { syncCreateEvent } from "@/lib/gcal/client";
import { sendBookingConfirmation } from "@/lib/line/client";
import { checkRateLimit } from "@/lib/api/rateLimit";

const externalBookingSchema = z.object({
  tenant_slug: z
    .string()
    .trim()
    .min(1, "tenant_slug, customer_name, title, scheduled_date, start_time, end_time は必須です")
    .max(100),
  customer_name: z
    .string()
    .trim()
    .min(1, "tenant_slug, customer_name, title, scheduled_date, start_time, end_time は必須です")
    .max(100),
  customer_email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  customer_phone: z.string().trim().max(40).optional(),
  line_user_id: z.string().trim().max(200).optional(),
  title: z
    .string()
    .trim()
    .min(1, "tenant_slug, customer_name, title, scheduled_date, start_time, end_time は必須です")
    .max(200),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduled_date は YYYY-MM-DD 形式です"),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です"),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time / end_time は HH:MM 形式です"),
  note: z.string().trim().max(2000).optional(),
  source: z.enum(["google_maps", "line", "web"]).optional(),
});

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
    // ── API Key 認証 ──
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return apiError({ code: "unauthorized", message: "API key required", status: 401 });
    }

    const parsed = externalBookingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data;
    const tenantSlug = body.tenant_slug;
    const customerName = body.customer_name;
    const title = body.title;
    const scheduledDate = body.scheduled_date;
    const startTime = body.start_time;
    const endTime = body.end_time;

    const admin = createServiceRoleAdmin("public booking — looks up tenant from slug, no caller context");

    // テナント解決 + API キー検証（同時に行いタイミング攻撃を防ぐ）
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name, external_api_key")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .single();

    if (!tenant) {
      return apiValidationError("指定された店舗が見つかりません");
    }

    // テナント固有のAPIキーで検証
    // テナントにキーが設定されていない場合は CRON_SECRET へフォールバック（後方互換）
    const cronSecret = process.env.CRON_SECRET;
    const expectedKey = tenant.external_api_key ?? cronSecret;
    if (!expectedKey || apiKey !== expectedKey) {
      return apiError({ code: "unauthorized", message: "Invalid API key", status: 401 });
    }

    // ── 定休日チェック ──
    const dayOfWeek = new Date(scheduledDate + "T00:00:00").getDay();

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
      .select(
        "id, tenant_id, customer_id, title, scheduled_date, start_time, end_time, note, source, line_user_id, status",
      )
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
 *
 * レスポンス:
 *   { date, slots, closed, message? }
 *   closed=true の場合は定休日
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const queryParsed = z
      .object({
        tenant_slug: z.string().trim().min(1, "tenant_slug と date (YYYY-MM-DD) が必要です").max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date は YYYY-MM-DD 形式です"),
      })
      .safeParse({
        tenant_slug: url.searchParams.get("tenant_slug") ?? "",
        date: url.searchParams.get("date") ?? "",
      });
    if (!queryParsed.success) {
      return apiValidationError(queryParsed.error.issues[0]?.message ?? "invalid query");
    }
    const { tenant_slug: tenantSlug, date } = queryParsed.data;

    const admin = createServiceRoleAdmin("public booking — looks up tenant from slug, no caller context");

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .single<{ id: string; name: string | null }>();

    if (!tenant) {
      return apiValidationError("指定された店舗が見つかりません");
    }

    const dayOfWeek = new Date(date + "T00:00:00").getDay();

    // ── 定休日チェック ──────────────────────────────────────
    // 1) 毎週定休 (type=weekly, day_of_week=dayOfWeek)
    const { data: weeklyClosed } = await admin
      .from("closed_days")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("type", "weekly")
      .eq("day_of_week", dayOfWeek)
      .limit(1);

    const tenantName = tenant.name ?? null;

    if (weeklyClosed && weeklyClosed.length > 0) {
      return apiOk({ date, slots: [], closed: true, message: "この日は定休日です", tenant_name: tenantName });
    }

    // 2) 特定日定休 (type=specific, closed_date=date)
    const { data: specificClosed } = await admin
      .from("closed_days")
      .select("id, note")
      .eq("tenant_id", tenant.id)
      .eq("type", "specific")
      .eq("closed_date", date)
      .limit(1);

    if (specificClosed && specificClosed.length > 0) {
      const note = specificClosed[0].note;
      return apiOk({
        date,
        slots: [],
        closed: true,
        message: note ? `この日は休業日です（${note}）` : "この日は休業日です",
        tenant_name: tenantName,
      });
    }

    // ── スロット定義を取得 ──────────────────────────────────
    const { data: slots } = await admin
      .from("external_booking_slots")
      .select("start_time, end_time, max_bookings, label")
      .eq("tenant_id", tenant.id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .order("start_time");

    if (!slots || slots.length === 0) {
      return apiOk({
        date,
        slots: [],
        closed: false,
        message: "この日の予約枠は設定されていません",
        tenant_name: tenantName,
      });
    }

    // ── 既存予約を取得 ──────────────────────────────────────
    const { data: reservations } = await admin
      .from("reservations")
      .select("start_time, end_time")
      .eq("tenant_id", tenant.id)
      .eq("scheduled_date", date)
      .neq("status", "cancelled");

    const available = slots.map((slot: any) => {
      const booked = (reservations ?? []).filter(
        (r: any) => r.start_time < slot.end_time && r.end_time > slot.start_time,
      ).length;

      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        available: Math.max(0, slot.max_bookings - booked),
        max: slot.max_bookings,
        label: slot.label ?? null,
      };
    });

    return apiOk({ date, slots: available, closed: false, tenant_name: tenant.name ?? null });
  } catch (e) {
    return apiInternalError(e, "available slots");
  }
}
