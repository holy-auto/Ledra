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

/** HH:MM or HH:MM:SS → HH:MM:SS に正規化 */
function normalizeTime(t: string): string {
  // "10:00" → "10:00:00", "10:00:00" → "10:00:00"
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
 * - 新規イベント（gcal_event_id がまだない）を予約として取り込む
 * - 既存イベント（gcal_event_id 一致）は更新されていれば反映する
 */
export async function pullEventsFromCalendar(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ imported: number; updated: number; skipped: number }> {
  const result = { imported: 0, updated: 0, skipped: 0 };
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) {
      console.log("[gcal] pull: no calendar client for tenant", tenantId);
      return result;
    }

    console.log(`[gcal] pull: fetching events from ${dateFrom} to ${dateTo} for tenant ${tenantId}`);

    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: `${dateFrom}T00:00:00+09:00`,
      timeMax: `${dateTo}T23:59:59+09:00`,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
    });

    const events = res.data.items ?? [];
    console.log(`[gcal] pull: found ${events.length} events in Google Calendar`);

    if (events.length === 0) return result;

    // 既存の gcal_event_id → 予約データを取得（更新判定用）
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("reservations")
      .select("id, gcal_event_id, title, note, scheduled_date, start_time, end_time")
      .eq("tenant_id", tenantId)
      .not("gcal_event_id", "is", null);

    const existingMap = new Map(
      (existing ?? []).map((r: any) => [r.gcal_event_id, r]),
    );

    for (const event of events) {
      if (!event.id) continue;
      // cancelled イベントはスキップ
      if (event.status === "cancelled") {
        result.skipped++;
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
        // 既存予約: 変更があれば更新
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
        // 新規予約として取り込み
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

    console.log(`[gcal] pull: imported=${result.imported}, updated=${result.updated}, skipped=${result.skipped}`);
    await logSync(tenantId, null, "pull", null, "success",
      `imported=${result.imported}, updated=${result.updated}, skipped=${result.skipped}`);
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
 * gcal_event_id が未設定の予約のみ対象
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

    // 顧客名を一括取得
    const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
      (customers ?? []).forEach((c: any) => {
        customerMap[c.id] = c.name;
      });
    }

    let pushed = 0;

    for (const r of reservations) {
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
        // 個別エラーはスキップして続行
      }
    }

    return pushed;
  } catch (e) {
    await logSync(tenantId, null, "push", null, "error", String(e));
    return 0;
  }
}
