import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError, apiError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_TIMEOUT_MS = 55_000; // 55s guard (leave 5s buffer for Vercel's 60s limit)
const SYNC_WINDOW_HOURS = 24;

// ─── helpers (shared with manual sync) ───

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
      console.error("[square cron] token refresh failed:", res.status);
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
    console.error("[square cron] token refresh error:", e);
    return null;
  }
}

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
      console.error("[square cron] SearchOrders error:", res.status, errText);
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

// ─── types ───

type TenantResult = {
  tenantId: string;
  status: "synced" | "skipped" | "error";
  ordersFetched?: number;
  ordersImported?: number;
  error?: string;
};

// ─── GET: Square auto-sync cron ───

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth: verify cron request
    const { authorized, error: authError } = verifyCronRequest(req);
    if (!authorized) {
      return apiUnauthorized(authError);
    }

    const admin = getAdminClient();

    // Fetch all active square connections
    const { data: connections, error: connErr } = await admin
      .from("square_connections")
      .select("id, tenant_id, square_access_token, square_refresh_token, square_token_expires_at, square_location_ids, status")
      .eq("status", "active");

    if (connErr) {
      console.error("[square cron] failed to fetch connections:", connErr.message);
      return apiInternalError(connErr, "square cron fetch connections");
    }

    if (!connections || connections.length === 0) {
      console.info("[square cron] no active connections found");
      return apiOk({ processed: 0, synced: 0, errors: 0, results: [] });
    }

    console.info(`[square cron] processing ${connections.length} tenant(s)`);

    const results: TenantResult[] = [];
    let synced = 0;
    let errors = 0;

    // Date range: last 24 hours
    const now = new Date();
    const from = new Date(now.getTime() - SYNC_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();

    // Process tenants sequentially to avoid rate limits
    for (const conn of connections) {
      // Timeout guard
      if (Date.now() - startTime > CRON_TIMEOUT_MS) {
        console.warn("[square cron] timeout guard reached, stopping");
        break;
      }

      const tenantId = conn.tenant_id as string;
      const connectionId = conn.id as string;

      try {
        // Token expiry check & refresh
        let accessToken = conn.square_access_token as string;
        const expiresAt = new Date(conn.square_token_expires_at as string);

        if (expiresAt <= now) {
          const refreshed = await refreshSquareToken(
            connectionId,
            conn.square_refresh_token as string,
          );
          if (!refreshed) {
            console.warn(`[square cron] tenant=${tenantId} token refresh failed, skipping`);
            results.push({ tenantId, status: "skipped", error: "token_refresh_failed" });
            continue;
          }
          accessToken = refreshed.access_token;
        }

        const locationIds = (conn.square_location_ids as string[]) ?? [];
        if (locationIds.length === 0) {
          console.warn(`[square cron] tenant=${tenantId} no location IDs, skipping`);
          results.push({ tenantId, status: "skipped", error: "no_location_ids" });
          continue;
        }

        // Create sync run record
        const { data: syncRun, error: syncRunErr } = await admin
          .from("square_sync_runs")
          .insert({
            tenant_id: tenantId,
            status: "running",
            trigger_type: "auto",
            triggered_by: null,
            sync_from: from,
            sync_to: to,
          })
          .select("id")
          .single();

        if (syncRunErr) {
          console.error(`[square cron] tenant=${tenantId} sync run create failed:`, syncRunErr.message);
          results.push({ tenantId, status: "error", error: "sync_run_create_failed" });
          errors++;
          continue;
        }

        // Fetch orders from Square
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

          results.push({ tenantId, status: "error", error: "unauthorized" });
          errors++;
          continue;
        }

        // Upsert orders — batch check existing then batch insert
        let imported = 0;
        let skipped = 0;

        if (orders.length > 0) {
          // Batch fetch existing order IDs
          const squareOrderIds = orders.map((o: any) => o.id);
          const { data: existingOrders } = await admin
            .from("square_orders")
            .select("square_order_id")
            .eq("tenant_id", tenantId)
            .in("square_order_id", squareOrderIds);

          const existingSet = new Set((existingOrders ?? []).map((e) => e.square_order_id));

          const newOrders = orders.filter((o: any) => !existingSet.has(o.id));
          skipped = orders.length - newOrders.length;

          // Batch insert new orders in chunks of 50
          const CHUNK_SIZE = 50;
          for (let i = 0; i < newOrders.length; i += CHUNK_SIZE) {
            if (Date.now() - startTime > CRON_TIMEOUT_MS) {
              console.warn(`[square cron] tenant=${tenantId} timeout during order upsert`);
              break;
            }

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
                tenant_id: tenantId,
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

            const { error: insertErr, count: insertCount } = await admin
              .from("square_orders")
              .insert(rows);

            if (insertErr) {
              console.error(`[square cron] tenant=${tenantId} batch insert error:`, insertErr.message);
              skipped += chunk.length;
            } else {
              imported += chunk.length;
            }
          }
        }

        // Update sync run
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

        // Update last_synced_at on connection
        await admin
          .from("square_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("tenant_id", tenantId);

        console.info(`[square cron] tenant=${tenantId} done: fetched=${orders.length} imported=${imported} skipped=${skipped}`);
        results.push({
          tenantId,
          status: "synced",
          ordersFetched: orders.length,
          ordersImported: imported,
        });
        synced++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[square cron] tenant=${tenantId} unexpected error:`, msg);
        results.push({ tenantId, status: "error", error: msg });
        errors++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.info(`[square cron] finished in ${elapsed}ms: processed=${results.length} synced=${synced} errors=${errors}`);

    return apiOk({
      processed: results.length,
      synced,
      errors,
      elapsed_ms: elapsed,
      results,
    });
  } catch (e) {
    return apiInternalError(e, "square cron GET");
  }
}
