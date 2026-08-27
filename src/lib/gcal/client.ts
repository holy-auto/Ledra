import { calendar_v3, calendar } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { storeIdOrNull } from "@/lib/stores/resolveStoreId";

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
    scope: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"],
    state,
  });
}

/** 認可コードから refresh_token を取得して DB に保存 */
export async function exchangeCodeAndSave(code: string, tenantId: string): Promise<void> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  const { admin } = createTenantScopedAdmin(tenantId);
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
  const { admin } = createTenantScopedAdmin(tenantId);
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
  const { admin } = createTenantScopedAdmin(tenantId);
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
export async function syncCreateEvent(tenantId: string, reservation: ReservationData): Promise<string | null> {
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
      const { admin } = createTenantScopedAdmin(tenantId);
      await admin.from("reservations").update({ gcal_event_id: eventId }).eq("id", reservation.id);
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
      const { admin } = createTenantScopedAdmin(tenantId);
      await admin.from("reservations").update({ gcal_event_id: null }).eq("id", reservation.id);
      await logSync(
        tenantId,
        reservation.id,
        "update",
        reservation.gcal_event_id ?? null,
        "success",
        `GCal event gone (HTTP ${status}), cleared gcal_event_id`,
      );
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
      await logSync(
        tenantId,
        reservationId,
        "delete",
        gcalEventId,
        "success",
        `GCal event already deleted (HTTP ${status})`,
      );
      return;
    }
    await logSync(tenantId, reservationId, "delete", gcalEventId, "error", String(e));
  }
}

interface ReservationRow {
  id: string;
  gcal_event_id: string | null;
  gcal_calendar_id: string | null;
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

export type GcalReadMode = "full" | "busy";
export type GcalCalendarSpec = { id: string; mode: GcalReadMode };

/**
 * pull 時に予約へ書き込む title/note を mode 別に決める（純関数・単体テスト対象）。
 *   full … 予定名・詳細をそのまま取り込む
 *   busy … 予定名・内容を隠して「予定あり」ブロックにする（個人カレンダーの非表示）
 */
export function desiredReservationFields(
  summary: string | null | undefined,
  description: string | null | undefined,
  mode: GcalReadMode,
): { title: string; note: string | null } {
  if (mode === "busy") return { title: "予定あり", note: null };
  return { title: summary || "(無題)", note: description || null };
}

/** tenants.gcal_read_calendars（jsonb）を安全に正規化する（不正値・重複・除外IDを排除）。 */
export function normalizeReadCalendars(raw: unknown, excludeId?: string): GcalCalendarSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: GcalCalendarSpec[] = [];
  const seen = new Set<string>(excludeId ? [excludeId] : []);
  for (const c of raw) {
    const id = (c as { id?: unknown })?.id;
    const mode = (c as { mode?: unknown })?.mode;
    if (typeof id === "string" && id && !seen.has(id) && (mode === "full" || mode === "busy")) {
      seen.add(id);
      out.push({ id, mode });
    }
  }
  return out;
}

/**
 * Google Calendar → 予約テーブルへ pull 同期（複数カレンダー対応）
 *
 * メイン（gcal_calendar_id＝書き込み先）を full 読み取り、加えて gcal_read_calendars の
 * 各カレンダーをモード別に取り込む。busy モードは時間だけ押さえて予定名を隠す。
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

    const { admin } = createTenantScopedAdmin(tenantId);

    // メイン（書き込み先）は full 読み取り。追加カレンダーはモード別（メインと重複は除外）。
    const { data: tenant } = await admin.from("tenants").select("gcal_read_calendars").eq("id", tenantId).single();
    const calendars: GcalCalendarSpec[] = [
      { id: client.calendarId, mode: "full" },
      ...normalizeReadCalendars(tenant?.gcal_read_calendars, client.calendarId),
    ];

    // 既存の gcal 由来予約を一度に取得（カレンダー横断で event_id 照合）。
    const { data: existing } = await admin
      .from("reservations")
      .select("id, gcal_event_id, gcal_calendar_id, title, note, scheduled_date, start_time, end_time, status")
      .eq("tenant_id", tenantId)
      .not("gcal_event_id", "is", null);
    const existingMap = new Map((existing ?? []).map((r: ReservationRow) => [r.gcal_event_id, r]));

    for (const cal of calendars) {
      await pullOneCalendar(client.calendar, cal, admin, tenantId, dateFrom, dateTo, existingMap, result);
    }

    console.info(
      `[gcal] pull: imported=${result.imported}, updated=${result.updated}, cancelled=${result.cancelled}, skipped=${result.skipped} (calendars=${calendars.length})`,
    );
    await logSync(
      tenantId,
      null,
      "pull",
      null,
      "success",
      `imported=${result.imported}, updated=${result.updated}, cancelled=${result.cancelled}, skipped=${result.skipped}, calendars=${calendars.length}`,
    );
    return result;
  } catch (e) {
    console.error("[gcal] pull: error:", e);
    await logSync(tenantId, null, "pull", null, "error", String(e));
    return result;
  }
}

/** 1 カレンダー分の pull（mode 別マスキング・由来カレンダー記録つき）。失敗は他カレンダーに波及させない。 */
async function pullOneCalendar(
  cal: calendar_v3.Calendar,
  spec: GcalCalendarSpec,
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  existingMap: Map<string | null, ReservationRow>,
  result: { imported: number; updated: number; skipped: number; cancelled: number },
): Promise<void> {
  const { id: calendarId, mode } = spec;
  let events: calendar_v3.Schema$Event[];
  try {
    const res = await cal.events.list({
      calendarId,
      timeMin: `${dateFrom}T00:00:00+09:00`,
      timeMax: `${dateTo}T23:59:59+09:00`,
      singleEvents: true,
      showDeleted: true,
      maxResults: 500,
    });
    events = res.data.items ?? [];
  } catch (e) {
    // 権限喪失・カレンダー削除などの 1 カレンダー障害は握り、他カレンダーの同期を続ける。
    console.warn(`[gcal] pull: events.list failed for calendar ${calendarId}:`, e);
    await logSync(tenantId, null, "pull", null, "error", `calendar=${calendarId}: ${String(e)}`);
    return;
  }

  // 取り込んだ予約の店舗。イベントごとに引かないよう1回だけ解決する
  const storeId = await storeIdOrNull(admin, tenantId, "gcal pull");

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
          await logSync(
            tenantId,
            existingReservation.id,
            "pull_cancel",
            event.id,
            "success",
            "GCal event deleted/cancelled",
          );
        }
      } else {
        result.skipped++;
      }
      continue;
    }

    const startDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
    const startTime = event.start?.dateTime ? event.start.dateTime.slice(11, 19) : null;
    const endTime = event.end?.dateTime ? event.end.dateTime.slice(11, 19) : null;

    if (!startDate) {
      result.skipped++;
      continue;
    }
    // busy は「時間を押さえる」用途なので、時刻の無い終日予定はブロックにしない（＝スキップ）。
    if (mode === "busy" && !startTime) {
      result.skipped++;
      continue;
    }

    const { title, note } = desiredReservationFields(event.summary, event.description, mode);
    const existingReservation = existingMap.get(event.id);

    if (existingReservation) {
      const needsUpdate =
        existingReservation.title !== title ||
        existingReservation.note !== note ||
        existingReservation.scheduled_date !== startDate ||
        existingReservation.start_time !== startTime ||
        existingReservation.end_time !== endTime ||
        existingReservation.gcal_calendar_id !== calendarId;
      if (needsUpdate) {
        const { error } = await admin
          .from("reservations")
          .update({
            title,
            note,
            scheduled_date: startDate,
            start_time: startTime,
            end_time: endTime,
            gcal_calendar_id: calendarId,
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
          store_id: storeId,
          title,
          note,
          scheduled_date: startDate,
          start_time: startTime,
          end_time: endTime,
          gcal_event_id: event.id,
          gcal_calendar_id: calendarId,
          source: "gcal",
          status: "confirmed",
        })
        .select("id, gcal_event_id, gcal_calendar_id, title, note, scheduled_date, start_time, end_time, status")
        .single();
      if (error) {
        console.error(`[gcal] pull: failed to insert event ${event.id}:`, error.message);
        await logSync(tenantId, null, "pull_create", event.id, "error", error.message);
      } else {
        result.imported++;
        // 同一イベントが別カレンダーにも出る場合の二重挿入を防ぐ。
        if (inserted?.gcal_event_id) existingMap.set(inserted.gcal_event_id, inserted as ReservationRow);
        await logSync(tenantId, inserted?.id ?? null, "pull_create", event.id, "success");
      }
    }
  }
}

/** テナントのGoogleカレンダー一覧を取得 */
export async function listCalendars(tenantId: string): Promise<{ id: string; summary: string; primary?: boolean }[]> {
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
export async function pushReservationsToCalendar(tenantId: string, dateFrom: string, dateTo: string): Promise<number> {
  try {
    const client = await getCalendarClient(tenantId);
    if (!client) return 0;

    const { admin } = createTenantScopedAdmin(tenantId);
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

    const customerIds = [
      ...new Set((reservations as PushReservationRow[]).map((r) => r.customer_id).filter(Boolean) as string[]),
    ];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await admin.from("customers").select("id, name").in("id", customerIds);
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
          customer_name: r.customer_id ? (customerMap[r.customer_id] ?? null) : null,
        });

        const res = await client.calendar.events.insert({
          calendarId: client.calendarId,
          requestBody: event,
        });

        const eventId = res.data.id ?? null;
        if (eventId) {
          await admin.from("reservations").update({ gcal_event_id: eventId }).eq("id", r.id);
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
