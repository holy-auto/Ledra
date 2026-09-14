/**
 * POST /api/admin/customers/bulk-import
 *
 * Content-Type: text/csv または multipart/form-data ('file' フィールド)。
 * CSV ヘッダ (順不同, name 必須):
 *   name, name_kana, email, phone, postal_code, address, note,
 *   customer_type(個人/法人 または individual/corporate),
 *   corporate_number, invoice_registration_number, billing_cycle(都度/合算),
 *   short_name, honorific
 * → 個人・法人を同一 CSV で混在登録できる。
 *
 * 1 行 = 1 customer。同一テナント内で email が一致 (無ければ氏名+電話の名寄せ) する
 * 既存行は upsert。戻り値は { inserted, updated, skipped, errors[] }。
 *
 * 認証: caller 必須 + role >= staff。
 * Rate limit: tenant ごとに 60s/3 リクエストまで (大量送信防止)。
 */

import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseCsv } from "@/lib/csv/parse";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { customerCsvRowSchema } from "@/lib/validations/customer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 日本語ラベル → enum 値へ寄せる。CSV は人手編集を想定し表記揺れを吸収する。 */
const CUSTOMER_TYPE_ALIASES: Record<string, "individual" | "corporate"> = {
  個人: "individual",
  法人: "corporate",
  individual: "individual",
  corporate: "corporate",
};
const BILLING_CYCLE_ALIASES: Record<string, "per_job" | "consolidated"> = {
  都度: "per_job",
  都度払い: "per_job",
  per_job: "per_job",
  合算: "consolidated",
  締め払い: "consolidated",
  consolidated: "consolidated",
};

/** CSV セル (常に string) を customerCsvRowSchema が解釈できる形へ正規化する。 */
function normalizeCsvRow(raw: Record<string, string>): Record<string, unknown> {
  const t = (raw.customer_type ?? "").trim();
  const b = (raw.billing_cycle ?? "").trim();
  return {
    ...raw,
    customer_type: t ? (CUSTOMER_TYPE_ALIASES[t.toLowerCase()] ?? CUSTOMER_TYPE_ALIASES[t] ?? t) : undefined,
    billing_cycle: b ? (BILLING_CYCLE_ALIASES[b.toLowerCase()] ?? BILLING_CYCLE_ALIASES[b] ?? b) : undefined,
  };
}

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

    // 全顧客を読み込まず、CSV に現れるメール/電話と一致する候補だけを DB 側で抽出する。
    // 顧客総数が増えても取込メモリと名寄せ計算量が取込行数にだけ比例する。
    const candidateEmails = [
      ...new Set(
        parsed.rows
          .map((r) =>
            String(normalizeCsvRow(r).email ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
    const candidatePhones = [
      ...new Set(parsed.rows.map((r) => String(normalizeCsvRow(r).phone ?? "").replace(/[^0-9]/g, "")).filter(Boolean)),
    ];
    const { data: candData, error: candidateError } = await admin.rpc("match_customer_import_candidates", {
      p_tenant_id: tenantId,
      p_emails: candidateEmails,
      p_phones: candidatePhones,
    });
    if (candidateError) return apiInternalError(candidateError, "customers bulk import candidate lookup");
    const candidates = (candData ?? []) as CustomerCandidate[];
    const candidateByEmail = new Map(
      candidates.filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c.id]),
    );

    for (let i = 0; i < parsed.rows.length; i++) {
      const raw = parsed.rows[i];
      const row = customerCsvRowSchema.safeParse(normalizeCsvRow(raw));
      if (!row.success) {
        errors.push({ row_index: i, error: row.error.issues[0]?.message ?? "invalid" });
        skipped += 1;
        continue;
      }
      const v = row.data;

      // Look up existing by email when present.
      let existingId: string | null = v.email ? (candidateByEmail.get(v.email.trim().toLowerCase()) ?? null) : null;

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
        // 既存顧客の更新では、空の列で既存の値を上書き (消去) しない。
        // 値のある列だけを更新する。
        const updatePayload: Record<string, unknown> = { name: v.name };
        if (v.name_kana) updatePayload.name_kana = v.name_kana;
        if (v.email) updatePayload.email = v.email;
        if (v.phone) updatePayload.phone = v.phone;
        if (v.postal_code) updatePayload.postal_code = v.postal_code;
        if (v.address) updatePayload.address = v.address;
        if (v.note) updatePayload.note = v.note;
        if (v.customer_type === "corporate") updatePayload.customer_type = "corporate";
        if (v.corporate_number) updatePayload.corporate_number = v.corporate_number;
        if (v.invoice_registration_number) updatePayload.invoice_registration_number = v.invoice_registration_number;
        if (v.billing_cycle) updatePayload.billing_cycle = v.billing_cycle;
        if (v.short_name) updatePayload.short_name = v.short_name;
        if (v.honorific) updatePayload.honorific = v.honorific;

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
            name_kana: v.name_kana,
            email: v.email,
            phone: v.phone,
            postal_code: v.postal_code,
            address: v.address,
            note: v.note,
            customer_type: v.customer_type,
            corporate_number: v.corporate_number,
            invoice_registration_number: v.invoice_registration_number,
            billing_cycle: v.billing_cycle,
            short_name: v.short_name,
            honorific: v.honorific,
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
          if (v.email) candidateByEmail.set(v.email.trim().toLowerCase(), created.id as string);
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
