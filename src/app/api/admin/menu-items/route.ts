import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import {
  menuItemCreateSchema,
  menuItemCsvImportSchema,
  menuItemDeleteSchema,
  menuItemUpdateSchema,
} from "@/lib/validations/menu-item";
import { calcLaborPrice } from "@/lib/pricing/labor";
import { normalizeMenuSizePricing } from "@/lib/menu/sizePricing";

export const dynamic = "force-dynamic";

/** テナントのレバーレート (円/時)。未設定・取得失敗時は null */
async function fetchLaborRate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
): Promise<number | null> {
  const { data } = await supabase.from("tenants").select("labor_rate_per_hour").eq("id", tenantId).single();
  const rate = (data as { labor_rate_per_hour?: number | null } | null)?.labor_rate_per_hour;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

// ─── GET: 品目一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase
      .from("menu_items")
      .select(
        "id, name, item_code, description, unit_price, cost_price, margin_rate, tax_category, is_active, sort_order, estimated_minutes, labor_hours, category_large, category_medium, category_small, size_axis, size_prices, created_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);

    const [{ data, error }, laborRate] = await Promise.all([query, fetchLaborRate(supabase, caller.tenantId)]);
    if (error) {
      return apiInternalError(error, "menu-items list");
    }

    const res = apiJson({
      items: data ?? [],
      stats: { total: data?.length ?? 0 },
      labor_rate_per_hour: laborRate,
    });
    res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    return res;
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items GET");
  }
}

// ─── POST: 品目作成 / CSV一括インポート ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // メニュー(商品)マスタの変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "menu_items:manage")) return apiForbidden();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // CSV一括インポート
    if (body.action === "csv_import") {
      const csvParsed = menuItemCsvImportSchema.safeParse(body);
      if (!csvParsed.success) {
        return apiValidationError(csvParsed.error.issues[0]?.message ?? "invalid payload");
      }
      const lines = csvParsed.data.csv
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("品目名")); // ヘッダー行をスキップ

      // 工数 (5列目) から工賃を自動算出するためレバーレートを取得
      const laborRate = await fetchLaborRate(supabase, caller.tenantId);

      const rows = lines
        .map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          const laborHours = parts[4] ? parseFloat(parts[4]) : NaN;
          const hasLaborHours = Number.isFinite(laborHours) && laborHours > 0;
          const unitPrice = parseInt(parts[2] || "0", 10) || 0;
          // 単価未指定 (空/0) かつ 工数×レバーレートが算出可能なら工賃を自動採用
          const laborPrice = unitPrice === 0 && hasLaborHours ? calcLaborPrice(laborHours, laborRate) : null;
          return {
            tenant_id: caller.tenantId,
            name: parts[0] || "",
            description: parts[1] || null,
            unit_price: laborPrice ?? unitPrice,
            tax_category: parseInt(parts[3] || "10", 10) === 8 ? 8 : 10,
            labor_hours: hasLaborHours ? laborHours : null,
            // 大／中／小カテゴリは任意の末尾列（6〜8列目）。空欄は null
            category_large: parts[5] || null,
            category_medium: parts[6] || null,
            category_small: parts[7] || null,
          };
        })
        .filter((r) => r.name);

      if (rows.length === 0) {
        return apiValidationError("有効な行がありません");
      }

      // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin.from("menu_items").insert(rows).select("id");
      if (error) {
        return apiInternalError(error, "menu-items csv insert");
      }

      return apiJson({ ok: true, imported: data?.length ?? 0 });
    }

    // 単一作成
    const parsed = menuItemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { size_axis: rawAxis, size_prices: rawPrices, ...rest } = parsed.data;
    const row = {
      tenant_id: caller.tenantId,
      ...rest,
      // 軸と段キーを検証して保存用に正規化 (不正な段・空表は単一単価扱いに落とす)。
      ...normalizeMenuSizePricing(rawAxis, rawPrices),
    };

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("menu_items")
      .insert(row)
      .select(
        "id, name, item_code, description, unit_price, cost_price, margin_rate, tax_category, is_active, sort_order, estimated_minutes, labor_hours, category_large, category_medium, category_small, size_axis, size_prices, created_at",
      )
      .single();
    if (error) {
      // (tenant_id, item_code) UNIQUE 違反は 23505。品番の重複として返す。
      if ((error as { code?: string }).code === "23505") {
        return apiValidationError("この品番は既に使用されています。別の品番を指定してください。");
      }
      return apiInternalError(error, "menu-items insert");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items POST");
  }
}

// ─── PUT: 品目更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // メニュー(商品)マスタの変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "menu_items:manage")) return apiForbidden();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = menuItemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;
    const updates: Record<string, unknown> = { ...fields };
    // size_axis/size_prices は部分更新でクライアントが明示送信したときだけ触る
    // (zod は未指定を null に落とすため、そのまま入れると既存のサイズ別価格を消してしまう)。
    delete updates.size_axis;
    delete updates.size_prices;
    if ("size_axis" in body || "size_prices" in body) {
      Object.assign(updates, normalizeMenuSizePricing(body.size_axis, body.size_prices));
    }

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, name, item_code, description, unit_price, cost_price, margin_rate, tax_category, is_active, sort_order, estimated_minutes, labor_hours, category_large, category_medium, category_small, size_axis, size_prices, created_at",
      )
      .single();

    if (error) {
      // (tenant_id, item_code) UNIQUE 違反は 23505。品番の重複として返す。
      if ((error as { code?: string }).code === "23505") {
        return apiValidationError("この品番は既に使用されています。別の品番を指定してください。");
      }
      return apiInternalError(error, "menu-items update");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items PUT");
  }
}

// ─── DELETE: 品目論理削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // メニュー(商品)マスタの変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "menu_items:manage")) return apiForbidden();

    const parsed = menuItemDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    // 単一(id)・複数(ids)どちらも id 配列に正規化して一括論理削除
    const ids = parsed.data.ids ?? [parsed.data.id!];

    // RLS をバイパスしてサービスロールで論理削除（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("menu_items")
      .update({ is_active: false })
      .in("id", ids)
      .eq("tenant_id", caller.tenantId)
      .select("id");

    if (error) {
      return apiInternalError(error, "menu-items delete");
    }

    return apiJson({ ok: true, disabled: data?.length ?? 0 });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items DELETE");
  }
}
