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
        // 顧客 insert・車両 insert・ヒアリング更新の3つは **DB 側で1トランザクション**に
        // まとめてある（`public.link_hearing_customer`、
        // `supabase/migrations/20261012131100_link_hearing_customer_transaction.sql`）。
        //
        // アプリから3回に分けて投げていた頃は、途中で落ちると宙に浮いた行が残り、
        // 操作者が押し直すと顧客が二重に増えた（一覧のボタンは `status !== "linked"` の
        // 間ずっと出るので押し直しは普通に起こる）。アプリ側では閉じられない
        // —— 名前も電話も空のヒアリングがあり、既存顧客を引き当てる鍵が無い。
        //
        // 関数は SECURITY INVOKER なので、テナント分離は今までどおり RLS が見る。
        const { data: result, error: rpcErr } = await supabase.rpc("link_hearing_customer", {
          p_hearing_id: id,
          p_tenant_id: caller.tenantId,
        });

        if (rpcErr) return apiInternalError(rpcErr, "hearings link_customer");

        const linked = result as {
          ok?: boolean;
          error?: string;
          customer_id?: string | null;
          vehicle_id?: string | null;
          vehicle_error_code?: string | null;
        } | null;

        if (!linked?.ok) {
          // 「存在しない・他テナント・RLS で見えない」は関数が not_found で返す。
          if (linked?.error === "not_found") return apiNotFound("ヒアリングが見つかりません。");
          // それ以外で ok が立たないのは、返り値の形が想定と違うということ。黙って成功にしない。
          return apiInternalError(
            linked?.error ?? "link_hearing_customer returned an unexpected result",
            "hearings link_customer",
          );
        }

        // 車両だけが落ちた場合（顧客とヒアリングは確定している）。関数が副トランザクションで
        // 車両の失敗だけを巻き戻し、SQLSTATE を返す。黙って `vehicle_id: null` を返すと
        // 車両が無いことに誰も気づかないまま証明書発行へ進む。
        let vehicleError: string | null = null;
        if (linked.vehicle_error_code) {
          logger.error("hearings link_customer: vehicle insert failed", undefined, {
            route: "admin/hearings PUT",
            hearing_id: id,
            customer_id: linked.customer_id,
            sqlstate: linked.vehicle_error_code,
          });
          vehicleError = "車両の登録に失敗しました。顧客は登録済みです。車両は車両一覧から登録してください。";
        }

        return apiJson({
          ok: true,
          customer_id: linked.customer_id ?? null,
          vehicle_id: linked.vehicle_id ?? null,
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
