import { calendar_v3, calendar } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
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

  const oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri);
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
  const cal = calendar({ version: "v3", auth: oauth2 });
  const calendarId = (tenant.gcal_calendar_id as string) || "primary";

  return { calendar: cal, calendarId };
}

/** 同期ログ記録 */
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

/** HH:MM or HH:MM:SS → HH:MM:SS に正規化 */
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

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
    const startTime = normalizeTime(r.start_time);
    const endTime = normalizeTime(r.end_time);
    return {
      summary: r.title,
      description,
      start: { dateTime: `${date}T${startTime}`, timeZone: "Asia/Tokyo" },
      end: { dateTime: `${date}T${endTime}`, timeZone: "Asia/Tokyo" },
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
  } catch (e: unknown) {
    const status = (e as { code?: number })?.code ?? (e as { status?: number })?.status;
    if (status === 404 || status === 410) {
      console.info(`[gcal] update: event ${reservation.gcal_event_id} not found (${status}), clearing gcal_event_id`);
      const admin = getAdminClient();
      await admin
        .from("reservations")
        .update({ gcal_event_id: null })
        .eq("id", reservation.id);
      await logSync(tenantId, reservation.id, "update", reservation.gcal_event_id ?? null, "success",
        `GCal event gone (HTTP ${status}), cleared gcal_event_id`);
      return;
    }
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
  } catch (e: unknown) {
    const status = (e as { code?: number })?.code ?? (e as { status?: number })?.status;
    if (status === 404 || status === 410) {
      console.info(`[gcal] delete: event ${gcalEventId} already deleted (${status}), treating as success`);
      await logSync(tenantId, reservationId, "delete", gcalEventId, "success",
        `GCal event already deleted (HTTP ${status})`);
      return;
    }
    await logSync(tenantId, reservationId, "delete", gcalEventId, "error", String(e));
  }
}

interface ReservationRow {
  id: string;
  gcal_event_id: string | null;
  title: string;
  note: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

interface PushReservationRow {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  customer_id: string | null;
}

/**
 * Google Calendar → 予約テーブルへ pull 同期
 */
export async function pullEventsFromCalendar(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ imported: number; updated: number; skipped: number; cancelled: number }> {
  const result = { imported: 0, updated: 0, skipped: 0, cancelled: 0 };
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) {
      console.info("[gcal] pull: no calendar client for tenant", tenantId);
      return result;
    }

    console.info(`[gcal] pull: fetching events from ${dateFrom} to ${dateTo} for tenant ${tenantId}`);

    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: `${dateFrom}T00:00:00+09:00`,
      timeMax: `${dateTo}T23:59:59+09:00`,
      singleEvents: true,
      showDeleted: true,
      maxResults: 500,
    });

    const events = res.data.items ?? [];
    console.info(`[gcal] pull: found ${events.length} events in Google Calendar (including deleted)`);

    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("reservations")
      .select("id, gcal_event_id, title, note, scheduled_date, start_time, end_time, status")
      .eq("tenant_id", tenantId)
      .not("gcal_event_id", "is", null);

    const existingMap = new Map(
      (existing ?? []).map((r: ReservationRow) => [r.gcal_event_id, r]),
    );

    if (events.length === 0) return result;

    for (const event of events) {
      if (!event.id) continue;
      if (event.status === "cancelled") {
        const existingReservation = existingMap.get(event.id);
        if (existingReservation && existingReservation.status !== "cancelled") {
          const { error } = await admin
            .from("reservations")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancel_reason: "Googleカレンダーで削除されました",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingReservation.id);

          if (error) {
            console.error(`[gcal] pull: failed to cancel reservation ${existingReservation.id}:`, error.message);
          } else {
            result.cancelled++;
            await logSync(tenantId, existingReservation.id, "pull_cancel", event.id, "success",
              "GCal event deleted/cancelled");
          }
        } else {
          result.skipped++;
        }
        continue;
      }

      const summary = event.summary || "(無題)";
      const startDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
      const startTime = event.start?.dateTime
        ? event.start.dateTime.slice(11, 19)
        : null;
      const endTime = event.end?.dateTime
        ? event.end.dateTime.slice(11, 19)
        : null;

      if (!startDate) {
        console.warn(`[gcal] pull: skipping event ${event.id} — no start date`);
        result.skipped++;
        continue;
      }

      const existingReservation = existingMap.get(event.id);

      if (existingReservation) {
        const needsUpdate =
          existingReservation.title !== summary ||
          existingReservation.scheduled_date !== startDate ||
          existingReservation.start_time !== startTime ||
          existingReservation.end_time !== endTime ||
          existingReservation.note !== (event.description || null);

        if (needsUpdate) {
          const { error } = await admin
            .from("reservations")
            .update({
              title: summary,
              note: event.description || null,
              scheduled_date: startDate,
              start_time: startTime,
              end_time: endTime,
            })
            .eq("id", existingReservation.id);

          if (error) {
            console.error(`[gcal] pull: failed to update reservation ${existingReservation.id}:`, error.message);
          } else {
            result.updated++;
            await logSync(tenantId, existingReservation.id, "pull_update", event.id, "success");
          }
        } else {
          result.skipped++;
        }
      } else {
        const { data: inserted, error } = await admin
          .from("reservations")
          .insert({
            tenant_id: tenantId,
            title: summary,
            note: event.description || null,
            scheduled_date: startDate,
            start_time: startTime,
            end_time: endTime,
            gcal_event_id: event.id,
            source: "gcal",
            status: "confirmed",
          })
          .select("id")
          .single();

        if (error) {
          console.error(`[gcal] pull: failed to insert event ${event.id}:`, error.message);
          await logSync(tenantId, null, "pull_create", event.id, "error", error.message);
        } else {
          result.imported++;
          await logSync(tenantId, inserted?.id ?? null, "pull_create", event.id, "success");
        }
      }
    }

    console.info(`[gcal] pull: imported=${result.imported}, updated=${result.updated}, cancelled=${result.cancelled}, skipped=${result.skipped}`);
    await logSync(tenantId, null, "pull", null, "success",
      `imported=${result.imported}, updated=${result.updated}, cancelled=${result.cancelled}, skipped=${result.skipped}`);
    return result;
  } catch (e) {
    console.error("[gcal] pull: error:", e);
    await logSync(tenantId, null, "pull", null, "error", String(e));
    return result;
  }
}

/** テナントのGoogleカレンダー一覧を取得 */
export async function listCalendars(
  tenantId: string,
): Promise<{ id: string; summary: string; primary?: boolean }[]> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) return [];

    const res = await client.calendar.calendarList.list({ minAccessRole: "writer" });
    return (res.data.items ?? [])
      .map((c) => ({ id: c.id ?? "", summary: c.summary ?? "", primary: c.primary ?? false }))
      .filter((c) => c.id);
  } catch {
    return [];
  }
}

/**
 * 既存予約を一括で Google Calendar に push 同期
 */
export async function pushReservationsToCalendar(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) return 0;

    const admin = getAdminClient();
    const { data: reservations } = await admin
      .from("reservations")
      .select("id, title, scheduled_date, start_time, end_time, note, customer_id")
      .eq("tenant_id", tenantId)
      .is("gcal_event_id", null)
      .neq("status", "cancelled")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo)
      .order("scheduled_date")
      .limit(200);

    if (!reservations || reservations.length === 0) return 0;

    const customerIds = [...new Set(
      (reservations as PushReservationRow[]).map((r) => r.customer_id).filter(Boolean) as string[]
    )];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
      (customers ?? []).forEach((c: { id: string; name: string }) => {
        customerMap[c.id] = c.name;
      });
    }

    let pushed = 0;

    for (const r of reservations as PushReservationRow[]) {
      try {
        const event = buildEvent({
          id: r.id,
          title: r.title,
          scheduled_date: r.scheduled_date,
          start_time: r.start_time,
          end_time: r.end_time,
          note: r.note,
          customer_name: r.customer_id ? customerMap[r.customer_id] ?? null : null,
        });

        const res = await client.calendar.events.insert({
          calendarId: client.calendarId,
          requestBody: event,
        });

        const eventId = res.data.id ?? null;
        if (eventId) {
          await admin
            .from("reservations")
            .update({ gcal_event_id: eventId })
            .eq("id", r.id);
        }

        await logSync(tenantId, r.id, "create", eventId, "success");
        pushed++;
      } catch (e) {
        await logSync(tenantId, r.id, "create", null, "error", String(e));
      }
    }

    return pushed;
  } catch (e) {
    await logSync(tenantId, null, "push", null, "error", String(e));
    return 0;
  }
}
