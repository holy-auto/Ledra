import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { hearingCreateSchema, hearingUpdateSchema } from "@/lib/validations/hearing";

import { withCaller } from "@/lib/api/withCaller";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const { searchParams } = new URL(req.url);
      const status = searchParams.get("status");

      let query = supabase
        .from("hearings")
        .select(
          "id, tenant_id, customer_name, customer_phone, customer_email, vehicle_maker, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin, service_type, vehicle_size, coating_history, desired_menu, budget_range, concern_areas, scratches_dents, parking_environment, usage_frequency, additional_requests, hearing_json, status, customer_id, vehicle_id, created_at, updated_at",
        )
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query.limit(200);
      if (error) return apiInternalError(error, "hearings GET");

      return apiJson({ hearings: data ?? [] });
    } catch (e: unknown) {
      console.error("[hearings] GET failed:", e);
      return apiInternalError(e, "hearings");
    }
  },
  { routeName: "admin/hearings GET" },
);

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const parsed = hearingCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      // ヒアリングレコード作成 (null を空文字に詰め直して DB の既存慣例に合わせる)
      const toEmpty = (v: string | null | undefined) => v ?? "";
      const { data, error } = await supabase
        .from("hearings")
        .insert({
          tenant_id: caller.tenantId,
          customer_name: toEmpty(parsed.data.customer_name),
          customer_phone: toEmpty(parsed.data.customer_phone),
          customer_email: toEmpty(parsed.data.customer_email),
          vehicle_maker: toEmpty(parsed.data.vehicle_maker),
          vehicle_model: toEmpty(parsed.data.vehicle_model),
          vehicle_year: parsed.data.vehicle_year ?? null,
          vehicle_plate: toEmpty(parsed.data.vehicle_plate),
          vehicle_color: toEmpty(parsed.data.vehicle_color),
          vehicle_vin: toEmpty(parsed.data.vehicle_vin),
          service_type: toEmpty(parsed.data.service_type),
          vehicle_size: toEmpty(parsed.data.vehicle_size),
          coating_history: toEmpty(parsed.data.coating_history),
          desired_menu: toEmpty(parsed.data.desired_menu),
          budget_range: toEmpty(parsed.data.budget_range),
          concern_areas: toEmpty(parsed.data.concern_areas),
          scratches_dents: toEmpty(parsed.data.scratches_dents),
          parking_environment: toEmpty(parsed.data.parking_environment),
          usage_frequency: toEmpty(parsed.data.usage_frequency),
          additional_requests: toEmpty(parsed.data.additional_requests),
          hearing_json: parsed.data.hearing_json ?? {},
          status: "draft",
        })
        .select("id")
        .single();

      if (error) return apiInternalError(error, "hearings POST");

      return apiJson({ ok: true, id: data.id });
    } catch (e: unknown) {
      console.error("[hearings] POST failed:", e);
      return apiInternalError(e, "hearings");
    }
  },
  { permission: "customers:create", routeName: "admin/hearings POST" },
);

export const PUT = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const parsed = hearingUpdateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { id, action, ...fields } = parsed.data;

      // アクション: 顧客登録連携
      if (action === "link_customer") {
        // 顧客レコード作成
        const { data: hearing, error: hearErr } = await supabase
          .from("hearings")
          .select(
            "id, customer_name, customer_phone, customer_email, vehicle_maker, vehicle_model, vehicle_year, vehicle_plate, vehicle_vin, vehicle_size",
          )
          .eq("id", id)
          .eq("tenant_id", caller.tenantId)
          .single();

        // PGRST116 は 0 行（存在しない / 他テナント）。それ以外は DB 側の失敗なので
        // 404 に化けさせない —— 「見つかりません」を返すと操作者は id を疑って終わり、
        // 本当の原因（接続・権限・RLS）が誰にも届かない。
        if (hearErr && hearErr.code !== "PGRST116") {
          return apiInternalError(hearErr, "hearings link_customer select");
        }
        if (!hearing) return apiNotFound("ヒアリングが見つかりません。");

        // 顧客作成
        const { data: customer, error: custErr } = await supabase
          .from("customers")
          .insert({
            tenant_id: caller.tenantId,
            name: hearing.customer_name || "未入力",
            email: hearing.customer_email || null,
            phone: hearing.customer_phone || null,
          })
          .select("id")
          .single();

        if (custErr) return apiInternalError(custErr, "hearings link_customer");

        // 車両作成
        let vehicleId: string | null = null;
        let vehicleError: string | null = null;
        if (hearing.vehicle_maker || hearing.vehicle_model) {
          const { data: vehicle, error: vehErr } = await supabase
            .from("vehicles")
            .insert({
              tenant_id: caller.tenantId,
              maker: hearing.vehicle_maker || null,
              model: hearing.vehicle_model || null,
              year: hearing.vehicle_year || null,
              plate_display: hearing.vehicle_plate || null,
              vin_code: hearing.vehicle_vin || null,
              customer_id: customer.id,
              size_class: hearing.vehicle_size || null,
            })
            .select("id")
            .single();
          if (vehErr || !vehicle) {
            // **ここで 500 を返さない。** 顧客行は既に作成済みでロールバックできないので、
            // 500 にすると操作者は押し直し、顧客だけが二重に増える。
            // 顧客連携は完遂させ、「車両だけ落ちた」を返して画面に出す（黙って null を返すと
            // 車両が無いことに誰も気づかないまま証明書発行へ進む）。
            logger.error("hearings link_customer: vehicle insert failed", vehErr, {
              route: "admin/hearings PUT",
              hearing_id: id,
              customer_id: customer.id,
            });
            vehicleError = "車両の登録に失敗しました。顧客は登録済みです。車両は車両一覧から登録してください。";
          } else {
            vehicleId = vehicle.id;
          }
        }

        // ヒアリングレコード更新
        const { error: linkErr } = await supabase
          .from("hearings")
          .update({
            customer_id: customer.id,
            vehicle_id: vehicleId,
            status: "linked",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        // ここが落ちると顧客・車両は作られたのにヒアリングは draft のまま残る。
        // ok: true を返すと画面は成功として一覧を読み直し、status が draft のままなので
        // 操作者はもう一度押す —— 顧客が二重に増える。失敗は失敗として返す（Sentry にも載る）。
        if (linkErr) return apiInternalError(linkErr, "hearings link_customer update");

        return apiJson({
          ok: true,
          customer_id: customer.id,
          vehicle_id: vehicleId,
          ...(vehicleError ? { vehicle_error: vehicleError } : {}),
        });
      }

      // 通常更新 — zod が allowlist / 型検証済みなので、undefined を剥がしてそのまま。
      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updateFields[k] = v;
      }

      const { error } = await supabase
        .from("hearings")
        .update(updateFields)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);

      if (error) return apiInternalError(error, "hearings PUT");
      return apiJson({ ok: true });
    } catch (e: unknown) {
      console.error("[hearings] PUT failed:", e);
      return apiInternalError(e, "hearings");
    }
  },
  { permission: "customers:edit", routeName: "admin/hearings PUT" },
);
