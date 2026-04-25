import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "@/lib/api/response";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { Client } from "@upstash/qstash";

const squareSyncSchema = z.object({
  job_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  cursor: z.string().trim().max(1000).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 300;

const PAGE_SIZE = 100;

function getBaseUrl(): string {
  const url = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL,
  ].find(Boolean);
  if (!url) throw new Error("Base URL not set");
  return url.startsWith("http") ? url : `https://${url}`;
}

async function refreshSquareToken(
  connectionId: string,
  refreshToken: string,
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
): Promise<string | null> {
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
      console.error("[square-sync] token refresh failed:", res.status);
      return null;
    }

    const data = await res.json();
    await admin
      .from("square_connections")
      .update({
        square_access_token: data.access_token,
        square_refresh_token: data.refresh_token,
        square_token_expires_at: data.expires_at,
      })
      .eq("id", connectionId);

    return data.access_token as string;
  } catch (e) {
    console.error("[square-sync] token refresh error:", e);
    return null;
  }
}

async function handler(req: NextRequest) {
  const parsed = squareSyncSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiJson({ error: "invalid payload" }, { status: 400 });
  }
  const { job_id, tenant_id, cursor: resumeCursor } = parsed.data;

  const { admin } = createTenantScopedAdmin(tenant_id);

  await admin.from("square_sync_runs").update({ status: "processing" }).eq("id", job_id);

  try {
    // 接続情報と sync_run の日付範囲を並行取得
    const [{ data: conn }, { data: syncRun }] = await Promise.all([
      admin
        .from("square_connections")
        .select("id, square_access_token, square_refresh_token, square_token_expires_at, square_location_ids")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .maybeSingle(),
      admin
        .from("square_sync_runs")
        .select("sync_from, sync_to, orders_fetched, orders_imported, orders_skipped, processed_count")
        .eq("id", job_id)
        .single(),
    ]);

    if (!conn) {
      await admin
        .from("square_sync_runs")
        .update({
          status: "failed",
          error_message: "No active Square connection",
          finished_at: new Date().toISOString(),
        })
        .eq("id", job_id);
      return apiJson({ error: "No connection" }, { status: 400 });
    }

    // トークン期限チェック＆リフレッシュ
    let accessToken = conn.square_access_token as string;
    const expiresAt = new Date(conn.square_token_expires_at as string);
    if (expiresAt <= new Date()) {
      const refreshed = await refreshSquareToken(conn.id as string, conn.square_refresh_token as string, admin);
      if (!refreshed) {
        await admin
          .from("square_sync_runs")
          .update({
            status: "failed",
            error_message: "Token refresh failed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", job_id);
        return apiJson({ error: "Token refresh failed" }, { status: 401 });
      }
      accessToken = refreshed;
    }

    const locationIds = (conn.square_location_ids as string[]) ?? [];
    const from = syncRun?.sync_from as string;
    const to = syncRun?.sync_to as string;

    // Square SearchOrders API — 1ページ分だけ取得してカーソルがあれば自己再キューイング
    const searchBody: Record<string, unknown> = {
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
      limit: PAGE_SIZE,
    };
    if (resumeCursor) searchBody.cursor = resumeCursor;

    const res = await fetch("https://connect.squareup.com/v2/orders/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (res.status === 401) {
      await admin
        .from("square_sync_runs")
        .update({
          status: "failed",
          errors_json: [{ message: "Token expired" }],
          finished_at: new Date().toISOString(),
        })
        .eq("id", job_id);
      return apiJson({ error: "Unauthorized" }, { status: 401 });
    }

    if (!res.ok) {
      throw new Error(`Square API error: ${res.status}`);
    }

    const data = await res.json();
    const orders: any[] = data.orders ?? [];
    const nextCursor: string | undefined = data.cursor;

    // 新規オーダーを batch insert（既存のロジックをそのまま維持）
    let imported = 0;
    let skipped = 0;

    if (orders.length > 0) {
      const squareOrderIds = orders.map((o: any) => o.id);
      const { data: existingOrders } = await admin
        .from("square_orders")
        .select("square_order_id")
        .eq("tenant_id", tenant_id)
        .in("square_order_id", squareOrderIds);

      const existingSet = new Set((existingOrders ?? []).map((e) => e.square_order_id));
      const newOrders = orders.filter((o: any) => !existingSet.has(o.id));
      skipped = orders.length - newOrders.length;

      const CHUNK_SIZE = 50;
      for (let i = 0; i < newOrders.length; i += CHUNK_SIZE) {
        const chunk = newOrders.slice(i, i + CHUNK_SIZE);
        const rows = chunk.map((order: any) => {
          const totalMoney = order.total_money?.amount ?? 0;
          const taxMoney = order.total_tax_money?.amount ?? 0;
          const discountMoney = order.total_discount_money?.amount ?? 0;
          const tipMoney = order.total_tip_money?.amount ?? 0;
          const paymentMethods: string[] = (order.tenders ?? []).map((t: any) => t.type ?? "UNKNOWN");
          const receiptUrl = (order.tenders ?? []).find((t: any) => t.receipt_url)?.receipt_url ?? null;

          return {
            tenant_id,
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

        const { error: insertErr } = await admin.from("square_orders").insert(rows);
        if (insertErr) {
          console.error("[square-sync] batch insert error:", insertErr.message);
          skipped += chunk.length;
        } else {
          imported += chunk.length;
        }
      }
    }

    // 累積カウントを取得して更新
    const prevFetched = (syncRun?.orders_fetched as number) ?? 0;
    const prevImported = (syncRun?.orders_imported as number) ?? 0;
    const prevSkipped = (syncRun?.orders_skipped as number) ?? 0;
    const prevProcessed = (syncRun?.processed_count as number) ?? 0;

    if (nextCursor) {
      // 次ページがあれば自己再キューイング（2秒後、Square レートリミット対策）
      const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
      await qstash.publishJSON({
        url: `${getBaseUrl()}/api/qstash/square-sync`,
        body: { job_id, tenant_id, cursor: nextCursor },
        retries: 2,
        delay: 2,
      });

      await admin
        .from("square_sync_runs")
        .update({
          status: "processing",
          cursor: nextCursor,
          orders_fetched: prevFetched + orders.length,
          orders_imported: prevImported + imported,
          orders_skipped: prevSkipped + skipped,
          processed_count: prevProcessed + orders.length,
        })
        .eq("id", job_id);

      console.info(`[square-sync] job=${job_id} page done fetched=${orders.length} cursor=${nextCursor}`);

      return apiJson({ success: true, continuing: true });
    }

    // 全ページ完了
    await admin
      .from("square_sync_runs")
      .update({
        status: "completed",
        cursor: null,
        orders_fetched: prevFetched + orders.length,
        orders_imported: prevImported + imported,
        orders_skipped: prevSkipped + skipped,
        processed_count: prevProcessed + orders.length,
        errors_json: [],
        finished_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    // square_connections の last_synced_at を更新
    await admin
      .from("square_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("tenant_id", tenant_id);

    console.info(`[square-sync] job=${job_id} completed total_fetched=${prevFetched + orders.length}`);

    return apiJson({ success: true });
  } catch (e) {
    console.error("[square-sync] job failed:", e);
    await admin
      .from("square_sync_runs")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
        finished_at: new Date().toISOString(),
      })
      .eq("id", job_id);
    return apiJson({ error: "Job failed" }, { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
