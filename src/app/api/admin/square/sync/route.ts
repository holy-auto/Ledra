import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiError,
  apiValidationError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * Square アクセストークンをリフレッシュする
 */
async function refreshSquareToken(
  connectionId: string,
  refreshToken: string,
): Promise<{ access_token: string; expires_at: string } | null> {
  try {
    const res = await fetch("https://connect.squareup.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APP_ID,
        client_secret: process.env.SQUARE_APP_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("[square sync] token refresh failed:", res.status);
      return null;
    }

    const data = await res.json();
    const admin = getAdminClient();
    await admin
      .from("square_connections")
      .update({
        square_access_token: data.access_token,
        square_refresh_token: data.refresh_token,
        square_token_expires_at: data.expires_at,
      })
      .eq("id", connectionId);

    return {
      access_token: data.access_token,
      expires_at: data.expires_at,
    };
  } catch (e) {
    console.error("[square sync] token refresh error:", e);
    return null;
  }
}

/**
 * Square SearchOrders API からオーダーを全件取得（ページネーション対応）
 */
async function fetchAllOrders(
  accessToken: string,
  locationIds: string[],
  from: string,
  to: string,
): Promise<{ orders: any[]; error?: string }> {
  const allOrders: any[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: {
            created_at: {
              start_at: new Date(from).toISOString(),
              end_at: new Date(to).toISOString(),
            },
          },
          state_filter: { states: ["COMPLETED", "OPEN"] },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
      },
      limit: 100,
    };
    if (cursor) body.cursor = cursor;

    const res = await fetch(
      "https://connect.squareup.com/v2/orders/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 429) {
      return { orders: allOrders, error: "rate_limited" };
    }
    if (res.status === 401) {
      return { orders: allOrders, error: "unauthorized" };
    }
    if (!res.ok) {
      const errText = await res.text();
      console.error("[square sync] SearchOrders error:", res.status, errText);
      return { orders: allOrders, error: `square_api_error_${res.status}` };
    }

    const data = await res.json();
    if (data.orders) {
      allOrders.push(...data.orders);
    }
    cursor = data.cursor;
  } while (cursor);

  return { orders: allOrders };
}

// ─── POST: Square 手動同期 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    // Rate limit: 5 req/min per tenant
    const limited = await checkRateLimit(req, "auth", `square-sync:${caller.tenantId}`);
    if (limited) return limited;

    const admin = getAdminClient();

    // 接続情報を取得
    const { data: conn } = await admin
      .from("square_connections")
      .select("id, square_access_token, square_refresh_token, square_token_expires_at, square_location_ids, status")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!conn || conn.status !== "active") {
      return apiError({
        code: "validation_error",
        message: "Squareが接続されていません。先に連携を行ってください。",
        status: 400,
      });
    }

    // トークン期限チェック＆リフレッシュ
    let accessToken = conn.square_access_token as string;
    const expiresAt = new Date(conn.square_token_expires_at as string);
    if (expiresAt <= new Date()) {
      const refreshed = await refreshSquareToken(
        conn.id as string,
        conn.square_refresh_token as string,
      );
      if (!refreshed) {
        return apiError({
          code: "auth_error",
          message: "Squareトークンのリフレッシュに失敗しました。再連携してください。",
          status: 401,
        });
      }
      accessToken = refreshed.access_token;
    }

    // リクエストボディから日付範囲を取得（デフォルト: 過去90日）
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const defaultTo = now.toISOString().slice(0, 10);
    const from = (body?.from as string) || defaultFrom;
    const to = (body?.to as string) || defaultTo;

    const locationIds = (conn.square_location_ids as string[]) ?? [];
    if (locationIds.length === 0) {
      return apiValidationError("Squareのロケーション情報がありません。再連携してください。");
    }

    // sync run レコード作成
    const { data: syncRun, error: syncRunErr } = await admin
      .from("square_sync_runs")
      .insert({
        tenant_id: caller.tenantId,
        status: "running",
        trigger_type: "manual",
        triggered_by: caller.userId,
        sync_from: new Date(from).toISOString(),
        sync_to: new Date(to).toISOString(),
      })
      .select("id")
      .single();

    if (syncRunErr) {
      console.error("[square sync] failed to create sync run:", syncRunErr.message);
      return apiInternalError(syncRunErr, "square sync run create");
    }

    // Square API からオーダーを取得
    const { orders, error: fetchError } = await fetchAllOrders(
      accessToken,
      locationIds,
      from,
      to,
    );

    if (fetchError === "unauthorized") {
      await admin
        .from("square_sync_runs")
        .update({
          status: "failed",
          errors_json: [{ message: "Token expired" }],
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRun.id);
      return apiError({
        code: "auth_error",
        message: "Squareの認証に失敗しました。再連携してください。",
        status: 401,
      });
    }

    // オーダーを upsert — batch check existing then batch insert
    let imported = 0;
    let skipped = 0;

    if (orders.length > 0) {
      // Batch fetch existing order IDs
      const squareOrderIds = orders.map((o: any) => o.id);
      const { data: existingOrders } = await admin
        .from("square_orders")
        .select("square_order_id")
        .eq("tenant_id", caller.tenantId)
        .in("square_order_id", squareOrderIds);

      const existingSet = new Set((existingOrders ?? []).map((e) => e.square_order_id));

      const newOrders = orders.filter((o: any) => !existingSet.has(o.id));
      skipped = orders.length - newOrders.length;

      // Batch insert new orders in chunks of 50
      const CHUNK_SIZE = 50;
      for (let i = 0; i < newOrders.length; i += CHUNK_SIZE) {
        const chunk = newOrders.slice(i, i + CHUNK_SIZE);
        const rows = chunk.map((order: any) => {
          const totalMoney = order.total_money?.amount ?? 0;
          const taxMoney = order.total_tax_money?.amount ?? 0;
          const discountMoney = order.total_discount_money?.amount ?? 0;
          const tipMoney = order.total_tip_money?.amount ?? 0;
          const paymentMethods: string[] = (order.tenders ?? []).map(
            (t: any) => t.type ?? "UNKNOWN",
          );
          const receiptUrl =
            (order.tenders ?? []).find((t: any) => t.receipt_url)?.receipt_url ?? null;

          return {
            tenant_id: caller.tenantId,
            square_order_id: order.id,
            square_location_id: order.location_id,
            order_state: order.state,
            total_amount: totalMoney,
            tax_amount: taxMoney,
            discount_amount: discountMoney,
            tip_amount: tipMoney,
            net_amount: totalMoney - taxMoney,
            currency: order.total_money?.currency ?? "JPY",
            payment_methods: paymentMethods,
            items_json: order.line_items ?? [],
            tenders_json: order.tenders ?? [],
            square_customer_id: order.customer_id ?? null,
            square_receipt_url: receiptUrl,
            square_created_at: order.created_at,
            square_closed_at: order.closed_at ?? null,
            raw_json: order,
          };
        });

        const { error: insertErr } = await admin
          .from("square_orders")
          .insert(rows);

        if (insertErr) {
          console.error("[square sync] batch insert error:", insertErr.message);
          skipped += chunk.length;
        } else {
          imported += chunk.length;
        }
      }
    }

    // sync run 完了更新
    const errorsJson = fetchError ? [{ message: fetchError }] : [];
    await admin
      .from("square_sync_runs")
      .update({
        status: fetchError ? "partial" : "completed",
        orders_fetched: orders.length,
        orders_imported: imported,
        orders_skipped: skipped,
        errors_json: errorsJson,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncRun.id);

    // square_connections の last_synced_at を更新
    await admin
      .from("square_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("tenant_id", caller.tenantId);

    return apiOk({
      sync_run_id: syncRun.id as string,
      orders_fetched: orders.length,
      orders_imported: imported,
      orders_skipped: skipped,
    });
  } catch (e) {
    return apiInternalError(e, "square sync POST");
  }
}
