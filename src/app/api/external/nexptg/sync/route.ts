import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/external/nexptg/sync
 *
 * NexPTG（膜厚計）アプリからの測定データ同期受け口。
 * NexPTGアプリの「Synchronization」タブに以下を設定すると、
 * レポート保存時（Android）または手動同期時（iOS）に JSON が POST される。
 *
 *   URL:      https://<ledra-host>/api/external/nexptg/sync
 *   Auth:     NexPTGアプリは Basic Authentication のみサポート。
 *             username 欄は任意（空 or 任意文字列）、
 *             password 欄に tenants.external_api_key を入力する。
 *             後方互換として x-api-key ヘッダも受け付ける。
 *   Body:     application/json（NexPTG 仕様そのまま）
 *
 * 仕様書のトップレベル構造:
 *   { data: { history: [...], reports: [...] } }
 *
 * レスポンスコード（NexPTG 側の想定に揃える）:
 *   200 成功 / 400 リクエストエラー / 403 認証エラー / 500 サーバーエラー
 */

type ExtractedKey =
  | { ok: true; key: string; source: "x-api-key" | "basic-auth" }
  | { ok: false; reason: "no-header" | "invalid-basic" };

/** Basic 認証 / x-api-key ヘッダのどちらからでも APIキーを抽出する */
function extractApiKey(req: NextRequest): ExtractedKey {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey) return { ok: true, key: headerKey, source: "x-api-key" };

  const auth = req.headers.get("authorization");
  if (!auth) return { ok: false, reason: "no-header" };
  const match = auth.match(/^Basic\s+(.+)$/i);
  if (!match) return { ok: false, reason: "invalid-basic" };
  try {
    const decoded = atob(match[1].trim());
    const colon = decoded.indexOf(":");
    // 慣例: password 部分をキーとして扱う。username は任意。
    const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    if (!password) return { ok: false, reason: "invalid-basic" };
    return { ok: true, key: password, source: "basic-auth" };
  } catch {
    return { ok: false, reason: "invalid-basic" };
  }
}

/** 鍵の末尾4文字だけ残したマスク（ログ出力用。先頭はキーのprefixのみ残す） */
function maskKey(key: string): string {
  if (!key) return "(empty)";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

type PlaceId = "left" | "right" | "top" | "back";

type NexPtgValue = {
  value?: string | number;
  interpretation?: number;
  type?: string;
  timestamp?: number;
  position?: number;
};

type NexPtgSection = {
  type?: string;
  values?: NexPtgValue[];
};

type NexPtgPlace = {
  placeId?: PlaceId;
  data?: NexPtgSection[];
};

type NexPtgTire = {
  width?: string;
  profile?: string;
  diameter?: string;
  maker?: string;
  season?: string;
  section?: string;
  value1?: string;
  value2?: string;
};

type NexPtgReport = {
  id?: number | string;
  name?: string;
  date?: number;
  calibrationDate?: number;
  deviceSerialNumber?: string;
  model?: string;
  brand?: string;
  typeOfBody?: string;
  capacity?: string;
  power?: string;
  vin?: string;
  fuelType?: string;
  year?: string;
  unitOfMeasure?: string;
  extraFields?: unknown[];
  comment?: string;
  data?: NexPtgPlace[];
  dataInside?: NexPtgPlace[];
  tires?: NexPtgTire[];
};

type NexPtgHistoryValue = {
  value?: number | string;
  interpretation?: number;
  type?: string;
  date?: number;
};

type NexPtgHistoryGroup = {
  id?: number | string;
  name?: string;
  data?: NexPtgHistoryValue[];
};

type NexPtgEnvelope = {
  data?: {
    history?: NexPtgHistoryGroup[];
    reports?: NexPtgReport[];
  };
};

function toTimestamp(seconds: number | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function toNumericUm(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function flattenMeasurements(report: NexPtgReport, tenantId: string, reportId: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const emit = (places: NexPtgPlace[] | undefined, isInside: boolean) => {
    if (!Array.isArray(places)) return;
    for (const place of places) {
      const placeId = place?.placeId;
      if (placeId !== "left" && placeId !== "right" && placeId !== "top" && placeId !== "back") {
        continue;
      }
      const sections = Array.isArray(place.data) ? place.data : [];
      for (const section of sections) {
        const sectionType = section?.type;
        if (!sectionType) continue;
        const values = Array.isArray(section.values) ? section.values : [];
        for (const v of values) {
          rows.push({
            tenant_id: tenantId,
            report_id: reportId,
            is_inside: isInside,
            place_id: placeId,
            section: sectionType,
            position: typeof v?.position === "number" ? v.position : null,
            value_um: toNumericUm(v?.value),
            raw_value: v?.value !== undefined && v?.value !== null ? String(v.value) : null,
            interpretation: typeof v?.interpretation === "number" ? v.interpretation : null,
            material: v?.type ?? null,
            measured_at: toTimestamp(v?.timestamp),
          });
        }
      }
    }
  };

  emit(report.data, false);
  emit(report.dataInside, true);
  return rows;
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "webhook");
  if (limited) return limited;

  try {
    // ── API Key 認証（x-api-key または Basic Auth の password 部分）──
    const extracted = extractApiKey(req);
    if (!extracted.ok) {
      const reason =
        extracted.reason === "no-header"
          ? "Missing credentials: set Password field to your Ledra API key (Basic Auth) or send x-api-key header"
          : "Invalid Authorization header: expected Basic auth with API key in password field";
      console.warn("[nexptg.sync] auth failed:", extracted.reason);
      return apiError({ code: "unauthorized", message: reason, status: 403 });
    }
    const apiKey = extracted.key;

    const body = (await req.json().catch((): null => null)) as NexPtgEnvelope | null;
    if (!body || typeof body !== "object" || !body.data) {
      return apiValidationError("Invalid payload: expected { data: { history, reports } }");
    }

    const admin = createServiceRoleAdmin(
      "nexptg webhook — tenant resolved from external_api_key then queries continue with same admin",
    );

    // テナント解決（API キーの一致のみで特定する）
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, name, is_active")
      .eq("external_api_key", apiKey)
      .maybeSingle();

    if (tenantErr) return apiInternalError(tenantErr, "nexptg tenant lookup");
    if (!tenant) {
      console.warn(
        `[nexptg.sync] API key did not match any tenant. source=${extracted.source} masked=${maskKey(apiKey)}`,
      );
      return apiError({
        code: "unauthorized",
        message: "API key does not match any tenant. Re-check the key issued in Ledra settings.",
        status: 403,
      });
    }
    if (!tenant.is_active) {
      console.warn(`[nexptg.sync] tenant is inactive. tenant_id=${tenant.id}`);
      return apiError({
        code: "unauthorized",
        message: "Tenant is not active.",
        status: 403,
      });
    }

    const tenantId = tenant.id as string;
    const reports = Array.isArray(body.data.reports) ? body.data.reports : [];
    const history = Array.isArray(body.data.history) ? body.data.history : [];

    let reportsUpserted = 0;
    let measurementsInserted = 0;
    let tiresInserted = 0;
    let historyInserted = 0;

    // ── レポート同期 ──
    for (const r of reports) {
      if (r?.id === undefined || r?.id === null) continue;
      const externalReportId = String(r.id);

      // 車両紐付け（VINを優先）
      let vehicleId: string | null = null;
      const vin = (r.vin ?? "").trim();
      if (vin) {
        const { data: v } = await admin
          .from("vehicles")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("vin_code", vin)
          .limit(1)
          .maybeSingle();
        if (v) vehicleId = v.id as string;
      }

      const reportRow = {
        tenant_id: tenantId,
        vehicle_id: vehicleId,
        external_report_id: externalReportId,
        name: r.name ?? null,
        measured_at: toTimestamp(r.date),
        calibration_at: toTimestamp(r.calibrationDate),
        device_serial_number: r.deviceSerialNumber ?? null,
        brand: r.brand ?? null,
        model: r.model ?? null,
        vin: vin || null,
        year: r.year ?? null,
        type_of_body: r.typeOfBody ?? null,
        capacity: r.capacity ?? null,
        power: r.power ?? null,
        fuel_type: r.fuelType ?? null,
        unit_of_measure: r.unitOfMeasure ?? null,
        comment: r.comment ?? null,
        extra_fields: Array.isArray(r.extraFields) ? r.extraFields : [],
        raw_payload: r as unknown as Record<string, unknown>,
      };

      const { data: upserted, error: upsertErr } = await admin
        .from("thickness_reports")
        .upsert(reportRow, { onConflict: "tenant_id,external_report_id" })
        .select("id, vehicle_id")
        .single();

      if (upsertErr || !upserted) return apiInternalError(upsertErr, "nexptg report upsert");
      const reportId = upserted.id as string;
      reportsUpserted += 1;

      // 測定値 / タイヤは「最新に置き換える」方針（再送時の重複防止）
      await admin.from("thickness_measurements").delete().eq("report_id", reportId);
      await admin.from("thickness_tires").delete().eq("report_id", reportId);

      const measurementRows = flattenMeasurements(r, tenantId, reportId);
      if (measurementRows.length > 0) {
        const { error: mErr } = await admin.from("thickness_measurements").insert(measurementRows);
        if (mErr) return apiInternalError(mErr, "nexptg measurements insert");
        measurementsInserted += measurementRows.length;
      }

      const tires = Array.isArray(r.tires) ? r.tires : [];
      if (tires.length > 0) {
        const tireRows = tires.map((t) => ({
          tenant_id: tenantId,
          report_id: reportId,
          section: t?.section ?? null,
          maker: t?.maker ?? null,
          season: t?.season ?? null,
          width: t?.width ?? null,
          profile: t?.profile ?? null,
          diameter: t?.diameter ?? null,
          value1: t?.value1 ?? null,
          value2: t?.value2 ?? null,
        }));
        const { error: tErr } = await admin.from("thickness_tires").insert(tireRows);
        if (tErr) return apiInternalError(tErr, "nexptg tires insert");
        tiresInserted += tireRows.length;
      }

      // 車両履歴に記録（紐付いた車両がある場合のみ）
      if (vehicleId) {
        await admin.from("vehicle_histories").insert({
          tenant_id: tenantId,
          vehicle_id: vehicleId,
          type: "thickness_measurement",
          title: `膜厚測定（NexPTG）: ${r.name ?? externalReportId}`,
          description: r.comment ?? null,
          performed_at: toTimestamp(r.date) ?? new Date().toISOString(),
        });
      }
    }

    // ── history 同期（冪等キーで upsert）──
    for (const group of history) {
      if (group?.id === undefined || group?.id === null) continue;
      const externalGroupId = String(group.id);
      const items = Array.isArray(group.data) ? group.data : [];
      if (items.length === 0) continue;

      const rows = items.map((item) => ({
        tenant_id: tenantId,
        external_group_id: externalGroupId,
        group_name: group.name ?? null,
        value_um: toNumericUm(item?.value),
        raw_value: item?.value !== undefined && item?.value !== null ? String(item.value) : null,
        interpretation: typeof item?.interpretation === "number" ? item.interpretation : null,
        material: item?.type ?? null,
        measured_at: toTimestamp(item?.date),
      }));

      const { error: hErr } = await admin.from("thickness_history_items").upsert(rows, {
        onConflict: "tenant_id,external_group_id,measured_at,raw_value",
        ignoreDuplicates: true,
      });
      if (hErr) return apiInternalError(hErr, "nexptg history upsert");
      historyInserted += rows.length;
    }

    return apiOk({
      tenant_id: tenantId,
      reports: reportsUpserted,
      measurements: measurementsInserted,
      tires: tiresInserted,
      history: historyInserted,
    });
  } catch (e) {
    return apiInternalError(e, "nexptg sync");
  }
}
