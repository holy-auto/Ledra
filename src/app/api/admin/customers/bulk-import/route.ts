/**
 * POST /api/admin/customers/bulk-import
 *
 * Content-Type: text/csv または multipart/form-data ('file' フィールド)。
 * CSV ヘッダ: name, email, phone, note  (順不同、name 必須)
 *
 * 1 行 = 1 customer。同一テナント内で email が一致する既存行は upsert。
 * 戻り値は { inserted, updated, skipped, errors[] }。
 *
 * 認証: caller 必須 + role >= staff。
 * Rate limit: tenant ごとに 60s/3 リクエストまで (大量送信防止)。
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseCsv } from "@/lib/csv/parse";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const rowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(2000).optional(),
});

async function readCsv(req: NextRequest): Promise<{ ok: true; csv: string } | { ok: false; error: string }> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return { ok: false, error: "missing_file" };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "file_too_large" };
    return { ok: true, csv: await file.text() };
  }
  if (ct.includes("text/csv") || ct.includes("text/plain")) {
    return { ok: true, csv: await req.text() };
  }
  return { ok: false, error: "unsupported_content_type" };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const limited = await checkRateLimit(req, "admin_write");
    if (limited) return limited;

    const csv = await readCsv(req);
    if (!csv.ok) return apiValidationError(csv.error);

    let parsed;
    try {
      parsed = parseCsv(csv.csv, { maxRows: 5_000 });
    } catch (e) {
      return apiValidationError(e instanceof Error ? e.message : "csv_parse_failed");
    }

    if (parsed.rows.length === 0) return apiValidationError("empty_csv");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row_index: number; error: string }> = [];

    // 名寄せ用の候補を 1 回だけ読み込む。メール完全一致で拾えない表記揺れを
    // 氏名+電話の類似度で既存顧客に寄せ、重複顧客の増殖を防ぐ (AI 判定はオフ)。
    const { data: candData } = await admin
      .from("customers")
      .select("id, name, name_kana, phone, email")
      .eq("tenant_id", tenantId);
    const candidates = (candData ?? []) as CustomerCandidate[];

    for (let i = 0; i < parsed.rows.length; i++) {
      const raw = parsed.rows[i];
      const row = rowSchema.safeParse(raw);
      if (!row.success) {
        errors.push({ row_index: i, error: row.error.issues[0]?.message ?? "invalid" });
        skipped += 1;
        continue;
      }
      const v = row.data;

      // Look up existing by email when present.
      let existingId: string | null = null;
      if (v.email) {
        const { data: ex } = await admin
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("email", v.email)
          .maybeSingle();
        existingId = (ex as { id: string } | null)?.id ?? null;
      }

      // メールで拾えなければ氏名+電話の名寄せで既存顧客に寄せる (重複防止)。
      // ただし氏名のみの行は同名別人を誤って統合し得るため、電話 or メールの
      // 連絡先が揃っている行に限る (弱い手がかりでの誤マージを防ぐ)。
      if (!existingId && (v.email || v.phone) && candidates.length > 0) {
        const match = await fuzzyMatchCustomer(
          { query: { name: v.name, phone: v.phone ?? null, email: v.email ?? null }, candidates },
          { ai: false },
        );
        if (match.best && match.confidence >= 0.85) {
          existingId = match.best.candidate.id;
        }
      }

      if (existingId) {
        // 既存顧客の更新では、空の列で既存の連絡先を上書き (消去) しない。
        // 値のある列だけを更新する。
        const updatePayload: Record<string, unknown> = { name: v.name };
        if (v.email) updatePayload.email = v.email;
        if (v.phone) updatePayload.phone = v.phone;
        if (v.note) updatePayload.note = v.note;

        const { error } = await admin.from("customers").update(updatePayload).eq("id", existingId);
        if (error) {
          errors.push({ row_index: i, error: error.message });
          skipped += 1;
        } else {
          updated += 1;
        }
      } else {
        const { data: created, error } = await admin
          .from("customers")
          .insert({
            tenant_id: tenantId,
            name: v.name,
            email: v.email ?? null,
            phone: v.phone ?? null,
            note: v.note ?? null,
          })
          .select("id, name, name_kana, phone, email")
          .single();
        if (error || !created) {
          errors.push({ row_index: i, error: error?.message ?? "insert failed" });
          skipped += 1;
        } else {
          inserted += 1;
          // 同一取込内の後続行が重複作成しないよう候補へ追加。
          candidates.push(created as CustomerCandidate);
        }
      }
    }

    logger.info("customer bulk import complete", {
      tenantId,
      callerId: caller.userId,
      inserted,
      updated,
      skipped,
      errorCount: errors.length,
    });

    return apiOk({ inserted, updated, skipped, errors: errors.slice(0, 50) });
  } catch (e) {
    return apiInternalError(e, "customers/bulk-import");
  }
}
