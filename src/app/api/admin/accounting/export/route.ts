/**
 * GET /api/admin/accounting/export?year=2026&month=6&format=freee|mfcloud|generic
 *
 * 月次売上を会計ソフト取込用 CSV で返す。
 * ?preview=1 を付けると CSV ではなく JSON (件数 + 月次サマリ) を返す
 * (ダウンロード前のプレビュー用)。
 *
 * AuthZ: 管理者 (admin) 以上。会計データは経営機微情報のため line staff 不可。
 * テナント境界は createTenantScopedAdmin + 明示的 tenant_id 絞り込み (lib 内)。
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  fetchAccountingRows,
  summarize,
  buildAccountingCsv,
  isAccountingFormat,
  type AccountingFormat,
} from "@/lib/accounting/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const url = new URL(req.url);
    const now = new Date();
    const year = parseInt(url.searchParams.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(url.searchParams.get("month") ?? String(now.getMonth() + 1), 10);
    const rawFormat = url.searchParams.get("format") ?? "generic";
    const preview = url.searchParams.get("preview") === "1";

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return apiValidationError("年が不正です。");
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return apiValidationError("月は 1〜12 で指定してください。");
    }
    const format: AccountingFormat = isAccountingFormat(rawFormat) ? rawFormat : "generic";

    const rows = await fetchAccountingRows(caller.tenantId, year, month);

    // プレビュー: CSV を返さず件数とサマリだけ JSON で返す。
    if (preview) {
      return apiJson({ ok: true, format, summary: summarize(rows, year, month) });
    }

    const csv = buildAccountingCsv(rows, format);
    const mm = String(month).padStart(2, "0");
    const filename = `sales_${year}_${mm}.csv`;

    // Excel が UTF-8 を正しく認識するよう BOM を先頭に付与。
    return new NextResponse("﻿" + csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "admin/accounting/export GET");
  }
}
