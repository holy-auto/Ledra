import { google, calendar_v3 } from "googleapis";
import { getAdminClient } from "@/lib/api/auth";

/**
 * Google Calendar 連携クライアント
 *
 * 環境変数:
 *   GOOGLE_CLIENT_ID       — OAuth2 クライアントID
 *   GOOGLE_CLIENT_SECRET   — OAuth2 クライアントシークレット
 *   GOOGLE_REDIRECT_URI    — OAuth2 リダイレクトURI
 */

function getOAuth2Client(refreshToken?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (refreshToken) {
    oauth2.setCredentials({ refresh_token: refreshToken });
  }
  return oauth2;
}

/** Google OAuth 認可URL を生成 */
export function getAuthUrl(state: string): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state,
  });
}

/** 認可コードから refresh_token を取得して DB に保存 */
export async function exchangeCodeAndSave(code: string, tenantId: string): Promise<void> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  const admin = getAdminClient();
  await admin
    .from("tenants")
    .update({
      gcal_refresh_token: tokens.refresh_token,
      gcal_sync_enabled: true,
    })
    .eq("id", tenantId);
}

/** テナントの Google Calendar クライアントを取得 */
async function getCalendarClient(tenantId: string): Promise<{
  calendar: calendar_v3.Calendar;
  calendarId: string;
} | null> {
  const admin = getAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("gcal_refresh_token, gcal_calendar_id, gcal_sync_enabled")
    .eq("id", tenantId)
    .single();

  if (!tenant?.gcal_sync_enabled || !tenant.gcal_refresh_token) return null;

  const oauth2 = getOAuth2Client(tenant.gcal_refresh_token);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const calendarId = tenant.gcal_calendar_id || "primary";

  return { calendar, calendarId };
}

/** ダブルブッキングチェック関数 */
async function logSync(
  tenantId: string,
  reservationId: string | null,
  action: string,
  gcalEventId: string | null,
  status: "success" | "error",
  errorMessage?: string,
) {
  const admin = getAdminClient();
  await admin.from("gcal_sync_log").insert({
    tenant_id: tenantId,
    reservation_id: reservationId,
    action,
    gcal_event_id: gcalEventId,
    status,
    error_message: errorMessage,
  });
}

type ReservationData = {
  id: string;
  title: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  customer_name?: string | null;
  vehicle_label?: string | null;
};

function buildEvent(r: ReservationData): calendar_v3.Schema$Event {
  const date = r.scheduled_date; // YYYY-MM-DD

  const description = [
    r.customer_name ? `顧客: ${r.customer_name}` : null,
    r.vehicle_label ? `車両: ${r.vehicle_label}` : null,
    r.note ? `備考: ${r.note}` : null,
    `予約ID: ${r.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (r.start_time && r.end_time) {
    return {
      summary: r.title,
      description,
      start: { dateTime: `${date}T${r.start_time}`, timeZone: "Asia/Tokyo" },
      end: { dateTime: `${date}T${r.end_time}`, timeZone: "Asia/Tokyo" },
    };
  }

  // 終日イベント
  return {
    summary: r.title,
    description,
    start: { date },
    end: { date },
  };
}

/** 予約作成時に Google Calendar にイベントを追加 */
export async function syncCreateEvent(
  tenantId: string,
  reservation: ReservationData,
): Promise<string | null> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) return null;

    const event = buildEvent(reservation);
    const res = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: event,
    });

    const eventId = res.data.id ?? null;

    // reservations テーブルの gcal_event_id を更新
    if (eventId) {
      const admin = getAdminClient();
      await admin
        .from("reservations")
        .update({ gcal_event_id: eventId })
        .eq("id", reservation.id);
    }

    await logSync(tenantId, reservation.id, "create", eventId, "success");
    return eventId;
  } catch (e) {
    await logSync(tenantId, reservation.id, "create", null, "error", String(e));
    return null;
  }
}

/** 予約更新時に Google Calendar イベントを更新 */
export async function syncUpdateEvent(
  tenantId: string,
  reservation: ReservationData & { gcal_event_id?: string | null },
): Promise<void> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client || !reservation.gcal_event_id) return;

    const event = buildEvent(reservation);
    await client.calendar.events.update({
      calendarId: client.calendarId,
      eventId: reservation.gcal_event_id,
      requestBody: event,
    });

    await logSync(tenantId, reservation.id, "update", reservation.gcal_event_id, "success");
  } catch (e) {
    await logSync(tenantId, reservation.id, "update", reservation.gcal_event_id ?? null, "error", String(e));
  }
}

/** 予約キャンセル時に Google Calendar イベントを削除 */
export async function syncDeleteEvent(
  tenantId: string,
  reservationId: string,
  gcalEventId: string | null,
): Promise<void> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client || !gcalEventId) return;

    await client.calendar.events.delete({
      calendarId: client.calendarId,
      eventId: gcalEventId,
    });

    await logSync(tenantId, reservationId, "delete", gcalEventId, "success");
  } catch (e) {
    await logSync(tenantId, reservationId, "delete", gcalEventId, "error", String(e));
  }
}

/**
 * Google Calendar → 予約テーブルへ pull 同期
 * 新規イベント（gcal_event_id がまだない）を予約として取り込む
 */
export async function pullEventsFromCalendar(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) return 0;

    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: `${dateFrom}T00:00:00+09:00`,
      timeMax: `${dateTo}T23:59:59+09:00`,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 200,
    });

    const events = res.data.items ?? [];

    // 既存の gcal_event_id を取得
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("reservations")
      .select("gcal_event_id")
      .eq("tenant_id", tenantId)
      .not("gcal_event_id", "is", null);

    const existingIds = new Set((existing ?? []).map((r: any) => r.gcal_event_id));
    let imported = 0;

    for (const event of events) {
      if (!event.id || existingIds.has(event.id)) continue;
      if (!event.summary) continue;

      const startDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
      const startTime = event.start?.dateTime
        ? event.start.dateTime.slice(11, 19)
        : null;
      const endTime = event.end?.dateTime
        ? event.end.dateTime.slice(11, 19)
        : null;

      if (!startDate) continue;

      await admin.from("reservations").insert({
        tenant_id: tenantId,
        title: event.summary,
        note: event.description || null,
        scheduled_date: startDate,
        start_time: startTime,
        end_time: endTime,
        gcal_event_id: event.id,
        source: "google_maps",
        status: "confirmed",
      });

      imported++;
    }

    await logSync(tenantId, null, "pull", null, "success");
    return imported;
  } catch (e) {
    await logSync(tenantId, null, "pull", null, "error", String(e));
    return 0;
  }
}
