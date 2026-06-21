/**
 * 顧客事前カルテ (customer intake) — サーバ側ロジック.
 *
 * 店舗が「お客様にこの URL/QR を渡してください」を 1 クリックで作れて、
 * 顧客は OTP 等なしで URL から直接フォーム入力できる. OCR (身分証自動入力)
 * もこのトークン経由で叩ける.
 *
 * セキュリティ:
 * - token は raw のまま DB に保存しない. sha256(token || pepper) のみ保存.
 * - URL 上には short_id を載せ、検証のために body/header で raw token を送らせる
 *   実装にするとシンプルだが、UX を優先して URL に raw token を入れる構造にする.
 *   その代わり: 有効期限・1 回限り・OCR 回数上限の 3 重防御で漏洩時の影響を限定.
 * - 公開フローなので IP rate limit が必須 (route 側で適用).
 */
import crypto from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 30;

function getPepper(): string {
  const p = process.env.CUSTOMER_AUTH_PEPPER;
  if (!p) throw new Error("CUSTOMER_AUTH_PEPPER is not set");
  return p;
}

/** raw token を sha256(token || pepper) に変換. */
export function hashIntakeToken(token: string): string {
  return crypto.createHash("sha256").update(`intake|${token}|${getPepper()}`).digest("hex");
}

/** URL に載せる short_id (8 文字、英小文字+数字). */
function generateShortId(): string {
  // base32-ish (避ける文字なし) で 8 桁. 約 40bit のエントロピー.
  // crypto.randomInt は剰余バイアスのない一様乱数を返すため、`% 30` のような
  // モジュロバイアスを避けられる。
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/** raw token 本体 (URL のクエリ or path に載せる). 32 bytes 256bit. */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface CreatedIntake {
  id: string;
  shortId: string;
  rawToken: string;
  url: string;
  expiresAt: string;
}

export interface CreateIntakeInput {
  tenantId: string;
  storeId?: string | null;
  label?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  expiryDays?: number;
  /** auth.users.id. 公開予約フローなど認証ユーザがいない経路では null を渡す. */
  createdBy: string | null;
  baseUrl: string;
}

/**
 * 招待を新規発行する. raw token は **この戻り値以外には現れない**.
 * 呼び出し側で URL を生成して顧客に共有する.
 */
export async function createIntakeInvitation(input: CreateIntakeInput): Promise<CreatedIntake> {
  const expiryDays = Math.min(Math.max(input.expiryDays ?? DEFAULT_EXPIRY_DAYS, 1), MAX_EXPIRY_DAYS);
  const rawToken = generateRawToken();
  const tokenHash = hashIntakeToken(rawToken);

  const { admin } = createTenantScopedAdmin(input.tenantId);

  // short_id の衝突は理論上極めて低いが、最大 3 回までリトライ
  for (let i = 0; i < 3; i++) {
    const shortId = generateShortId();
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000);
    const { data, error } = await admin
      .from("customer_intake_invitations")
      .insert({
        tenant_id: input.tenantId,
        store_id: input.storeId ?? null,
        token_hash: tokenHash,
        short_id: shortId,
        label: input.label ?? null,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        created_by: input.createdBy ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, short_id, expires_at")
      .single();

    if (error) {
      // unique violation (short_id 衝突) はリトライ. 他はそのまま
      if (error.code === "23505" && error.message.includes("short_id")) continue;
      throw error;
    }
    if (!data) throw new Error("Failed to create intake invitation");

    const url = `${input.baseUrl}/intake/${data.short_id}?t=${rawToken}`;
    return {
      id: data.id,
      shortId: data.short_id,
      rawToken,
      url,
      expiresAt: data.expires_at,
    };
  }
  throw new Error("Failed to allocate short_id after retries");
}

export interface ValidatedIntake {
  id: string;
  tenantId: string;
  storeId: string | null;
  label: string | null;
  status: "pending" | "submitted" | "completed" | "revoked" | "expired";
  expiresAt: string;
  ocrAttempts: number;
}

/**
 * 公開フローで URL から渡された short_id + raw token を検証する.
 * 検証成功時のみ ValidatedIntake を返す. 失敗時は null.
 *
 * 注意: 期限切れは自動的に status='expired' に更新する (lazy).
 */
export async function validateIntakeToken(shortId: string, rawToken: string): Promise<ValidatedIntake | null> {
  if (!shortId || !rawToken) return null;
  if (!/^[a-z0-9]{8}$/.test(shortId)) return null;

  // tenantId が分からない段階なので service-role admin を直接使う必要がある.
  // ただし WHERE 句で token_hash 完全一致を要求するため、誤って他テナントの行を
  // 触ることはない.
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake token lookup: validate raw token before disclosing tenant_id");

  const tokenHash = hashIntakeToken(rawToken);
  const { data } = await sb
    .from("customer_intake_invitations")
    .select("id, tenant_id, store_id, label, status, expires_at, ocr_attempts")
    .eq("short_id", shortId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data) return null;

  const status = data.status as ValidatedIntake["status"];
  const expired = new Date(data.expires_at).getTime() < Date.now();

  if (expired && status === "pending") {
    // lazy expire
    await sb
      .from("customer_intake_invitations")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return {
      id: data.id,
      tenantId: data.tenant_id,
      storeId: data.store_id,
      label: data.label,
      status: "expired",
      expiresAt: data.expires_at,
      ocrAttempts: data.ocr_attempts ?? 0,
    };
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    storeId: data.store_id,
    label: data.label,
    status,
    expiresAt: data.expires_at,
    ocrAttempts: data.ocr_attempts ?? 0,
  };
}

/** OCR 使用カウンタをアトミックにインクリメント. CHECK 違反で false. */
export async function incrementOcrAttempts(intakeId: string): Promise<boolean> {
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake flow: token-gated tenant write");
  const { error } = await sb.rpc("increment_intake_ocr_attempts", { p_id: intakeId }).single();
  if (error) {
    // RPC が無い環境では、SELECT + UPDATE で fallback
    const { data } = await sb
      .from("customer_intake_invitations")
      .select("ocr_attempts")
      .eq("id", intakeId)
      .maybeSingle();
    if (!data) return false;
    const next = (data.ocr_attempts ?? 0) + 1;
    if (next > 10) return false;
    const { error: upErr } = await sb
      .from("customer_intake_invitations")
      .update({ ocr_attempts: next })
      .eq("id", intakeId);
    return !upErr;
  }
  return true;
}

export interface IntakeSubmitInput {
  intakeId: string;
  name: string;
  nameKana?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  birthDate?: string | null;
  note?: string | null;
}

/**
 * 公開フローから顧客が送信した内容を invitation 行に保存し、status=submitted にする.
 * **この時点では customers は作らない**. 店舗が approveIntake() で承認したときに作成.
 */
export async function submitIntake(input: IntakeSubmitInput): Promise<{ status: "submitted" }> {
  const { createServiceRoleAdmin } = await import("@/lib/supabase/admin");
  const sb = createServiceRoleAdmin("public intake flow: token-gated tenant write");

  const { error } = await sb
    .from("customer_intake_invitations")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_name: input.name,
      submitted_name_kana: input.nameKana ?? null,
      submitted_email: input.email ?? null,
      submitted_phone: input.phone ?? null,
      submitted_postal_code: input.postalCode ?? null,
      submitted_address: input.address ?? null,
      submitted_birth_date: input.birthDate ?? null,
      submitted_note: input.note ?? null,
    })
    .eq("id", input.intakeId)
    .eq("status", "pending");
  if (error) throw error;

  return { status: "submitted" };
}

export interface SubmittedIntake {
  id: string;
  tenantId: string;
  storeId: string | null;
  submittedAt: string | null;
  fields: {
    name: string | null;
    name_kana: string | null;
    email: string | null;
    phone: string | null;
    postal_code: string | null;
    address: string | null;
    birth_date: string | null;
    note: string | null;
  };
}

/** 指定された intake の提出内容を取得 (status=submitted のみ). */
export async function getSubmittedIntake(tenantId: string, intakeId: string): Promise<SubmittedIntake | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data } = await admin
    .from("customer_intake_invitations")
    .select(
      "id, tenant_id, store_id, status, submitted_at, submitted_name, submitted_name_kana, submitted_email, submitted_phone, submitted_postal_code, submitted_address, submitted_birth_date, submitted_note",
    )
    .eq("id", intakeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data || data.status !== "submitted") return null;
  return {
    id: data.id,
    tenantId: data.tenant_id,
    storeId: data.store_id,
    submittedAt: data.submitted_at,
    fields: {
      name: data.submitted_name,
      name_kana: data.submitted_name_kana,
      email: data.submitted_email,
      phone: data.submitted_phone,
      postal_code: data.submitted_postal_code,
      address: data.submitted_address,
      birth_date: data.submitted_birth_date,
      note: data.submitted_note,
    },
  };
}

export interface ApproveIntakeInput {
  intakeId: string;
  tenantId: string;
  approvedBy: string;
  /** 承認時の編集値 (未指定なら submitted_* をそのまま使う). */
  overrides?: Partial<{
    name: string;
    name_kana: string | null;
    email: string | null;
    phone: string | null;
    postal_code: string | null;
    address: string | null;
    birth_date: string | null;
    note: string | null;
  }>;
  /** 既存顧客にマージする場合の customers.id. 指定時は新規 INSERT せず UPDATE. */
  mergeIntoCustomerId?: string;
}

/**
 * 提出済み intake を承認して customers レコードを作成 (or 既存顧客にマージ) する.
 * status=submitted の行だけが対象.
 */
export async function approveIntake(input: ApproveIntakeInput): Promise<{ customerId: string; merged: boolean }> {
  const { admin } = createTenantScopedAdmin(input.tenantId);

  const { data: intake, error: fetchErr } = await admin
    .from("customer_intake_invitations")
    .select(
      "id, tenant_id, status, submitted_name, submitted_name_kana, submitted_email, submitted_phone, submitted_postal_code, submitted_address, submitted_birth_date, submitted_note",
    )
    .eq("id", input.intakeId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!intake) throw new Error("intake not found");
  if (intake.status !== "submitted") throw new Error(`intake status must be 'submitted' (got '${intake.status}')`);

  const o = input.overrides ?? {};
  const finalName = o.name ?? intake.submitted_name;
  if (!finalName || !String(finalName).trim()) throw new Error("name is required");

  const payload = {
    tenant_id: input.tenantId,
    name: String(finalName).trim(),
    name_kana: o.name_kana ?? intake.submitted_name_kana ?? null,
    email: o.email ?? intake.submitted_email ?? null,
    phone: o.phone ?? intake.submitted_phone ?? null,
    postal_code: o.postal_code ?? intake.submitted_postal_code ?? null,
    address: o.address ?? intake.submitted_address ?? null,
    birth_date: o.birth_date ?? intake.submitted_birth_date ?? null,
    note: o.note ?? intake.submitted_note ?? null,
  };

  let customerId: string;
  let merged = false;

  if (input.mergeIntoCustomerId) {
    // 既存顧客にマージ (空欄のみ埋める)
    const { data: existing, error: exErr } = await admin
      .from("customers")
      .select("id, name_kana, email, phone, postal_code, address, birth_date, note")
      .eq("id", input.mergeIntoCustomerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (exErr || !existing) throw exErr ?? new Error("merge target customer not found");

    const mergePatch = {
      name_kana: existing.name_kana ?? payload.name_kana,
      email: existing.email ?? payload.email,
      phone: existing.phone ?? payload.phone,
      postal_code: existing.postal_code ?? payload.postal_code,
      address: existing.address ?? payload.address,
      birth_date: existing.birth_date ?? payload.birth_date,
      note: existing.note ?? payload.note,
    };
    const { error: upErr } = await admin
      .from("customers")
      .update(mergePatch)
      .eq("id", input.mergeIntoCustomerId)
      .eq("tenant_id", input.tenantId);
    if (upErr) throw upErr;
    customerId = input.mergeIntoCustomerId;
    merged = true;
  } else {
    const { data: created, error: cErr } = await admin.from("customers").insert(payload).select("id").single();
    if (cErr || !created) throw cErr ?? new Error("failed to create customer");
    customerId = created.id;
  }

  const { error: uErr } = await admin
    .from("customer_intake_invitations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_customer_id: customerId,
      approved_at: new Date().toISOString(),
      approved_by: input.approvedBy,
    })
    .eq("id", input.intakeId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "submitted");
  if (uErr) throw uErr;

  return { customerId, merged };
}

// ─────────────────────────────────────────────
// 自動承認パイプライン
// ─────────────────────────────────────────────

/**
 * 顧客が送信した内容を「自動承認」可能か判定し、
 *   - 通過 + 重複なし → customers を新規作成、status=completed
 *   - 通過 + email AND phone が完全一致する既存顧客あり → 既存にマージ、status=completed
 *   - 通過 + 部分一致 (どちらか片方だけ一致) → 安全側で手動レビュー
 *   - 不通過 → status=submitted のまま、validation_issues に検証結果を保存
 *
 * 戻り値の status: "auto_completed" | "needs_review"
 *
 * 自動承認の場合 approved_by は NULL (= 自動).
 */
export interface SubmitAndProcessInput {
  intakeId: string;
  tenantId: string;
  name: string;
  nameKana?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  birthDate?: string | null;
  note?: string | null;
}

export interface SubmitAndProcessResult {
  status: "auto_completed" | "needs_review";
  customerId?: string;
  merged?: boolean;
  /** 手動レビューの場合、検証で見つかった問題. */
  issues?: Array<{ field: string; severity: "error" | "warning"; message: string; source: "rule" | "ai" }>;
}

export async function submitAndProcessIntake(input: SubmitAndProcessInput): Promise<SubmitAndProcessResult> {
  const { validateIntakeSubmission } = await import("@/lib/ai/intakeValidator");
  const { admin } = createTenantScopedAdmin(input.tenantId);

  // 1) 提出データを保存 (常に行う. AI 検証の前に行うことで監査ログが残る)
  const { error: subErr } = await admin
    .from("customer_intake_invitations")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_name: input.name,
      submitted_name_kana: input.nameKana ?? null,
      submitted_email: input.email ?? null,
      submitted_phone: input.phone ?? null,
      submitted_postal_code: input.postalCode ?? null,
      submitted_address: input.address ?? null,
      submitted_birth_date: input.birthDate ?? null,
      submitted_note: input.note ?? null,
      validation_issues: null,
    })
    .eq("id", input.intakeId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "pending");
  if (subErr) throw subErr;

  // 2) 自動検証
  const validation = await validateIntakeSubmission({
    name: input.name,
    name_kana: input.nameKana ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    postal_code: input.postalCode ?? null,
    address: input.address ?? null,
    birth_date: input.birthDate ?? null,
    note: input.note ?? null,
  });

  if (!validation.ok) {
    // 手動レビュー行きで validation_issues を保存
    await admin
      .from("customer_intake_invitations")
      .update({
        validation_issues: {
          issues: validation.issues,
          ai_confidence: validation.ai.confidence,
          ai_assessment: validation.ai.assessment,
          ai_available: validation.ai.available,
          checked_at: new Date().toISOString(),
        },
      })
      .eq("id", input.intakeId)
      .eq("tenant_id", input.tenantId);
    return { status: "needs_review", issues: validation.issues };
  }

  // 3) 重複検出
  const candidates = await findDuplicateCustomerCandidates(input.tenantId, {
    email: input.email ?? null,
    phone: input.phone ?? null,
  });

  // email AND phone が両方一致する候補 = 強いマッチ → 自動マージ
  const strongMatch = candidates.find(
    (c) =>
      input.email != null &&
      input.phone != null &&
      c.email != null &&
      c.phone != null &&
      c.email.trim().toLowerCase() === input.email.trim().toLowerCase() &&
      c.phone.trim() === input.phone.trim(),
  );

  // 部分一致 (email だけ / phone だけ) → 別人かもしれないので手動レビューへ
  if (!strongMatch && candidates.length > 0) {
    await admin
      .from("customer_intake_invitations")
      .update({
        validation_issues: {
          issues: [
            {
              field: candidates[0].email ? "email" : "phone",
              severity: "warning" as const,
              message: "同じ連絡先の既存顧客が見つかったため、確認が必要です",
              source: "rule" as const,
            },
          ],
          ai_confidence: validation.ai.confidence,
          ai_assessment: validation.ai.assessment,
          ai_available: validation.ai.available,
          checked_at: new Date().toISOString(),
        },
      })
      .eq("id", input.intakeId)
      .eq("tenant_id", input.tenantId);
    return {
      status: "needs_review",
      issues: [
        {
          field: candidates[0].email ? "email" : "phone",
          severity: "warning",
          message: "同じ連絡先の既存顧客が見つかったため、確認が必要です",
          source: "rule",
        },
      ],
    };
  }

  // 4) 自動承認 = approveIntake と同じ処理 (approved_by は NULL のまま)
  if (strongMatch) {
    // 既存顧客にマージ
    const { data: existing } = await admin
      .from("customers")
      .select("id, name_kana, email, phone, postal_code, address, birth_date, note")
      .eq("id", strongMatch.id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (!existing) throw new Error("strong-match customer disappeared");
    const mergePatch = {
      name_kana: existing.name_kana ?? input.nameKana ?? null,
      email: existing.email ?? input.email ?? null,
      phone: existing.phone ?? input.phone ?? null,
      postal_code: existing.postal_code ?? input.postalCode ?? null,
      address: existing.address ?? input.address ?? null,
      birth_date: existing.birth_date ?? input.birthDate ?? null,
      note: existing.note ?? input.note ?? null,
    };
    const { error: upErr } = await admin
      .from("customers")
      .update(mergePatch)
      .eq("id", strongMatch.id)
      .eq("tenant_id", input.tenantId);
    if (upErr) throw upErr;

    await admin
      .from("customer_intake_invitations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_customer_id: strongMatch.id,
        approved_at: new Date().toISOString(),
        approved_by: null, // 自動承認
      })
      .eq("id", input.intakeId)
      .eq("tenant_id", input.tenantId)
      .eq("status", "submitted");

    return { status: "auto_completed", customerId: strongMatch.id, merged: true };
  }

  // 新規顧客を作成
  const { data: created, error: cErr } = await admin
    .from("customers")
    .insert({
      tenant_id: input.tenantId,
      name: input.name.trim(),
      name_kana: input.nameKana ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      postal_code: input.postalCode ?? null,
      address: input.address ?? null,
      birth_date: input.birthDate ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (cErr || !created) throw cErr ?? new Error("failed to create customer");

  await admin
    .from("customer_intake_invitations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_customer_id: created.id,
      approved_at: new Date().toISOString(),
      approved_by: null,
    })
    .eq("id", input.intakeId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "submitted");

  return { status: "auto_completed", customerId: created.id, merged: false };
}

/** 提出された intake と email/phone が完全一致する既存顧客を最大 5 件返す. */
export async function findDuplicateCustomerCandidates(
  tenantId: string,
  hints: { email?: string | null; phone?: string | null },
): Promise<Array<{ id: string; name: string; email: string | null; phone: string | null }>> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const candidates = new Map<string, { id: string; name: string; email: string | null; phone: string | null }>();

  if (hints.email && hints.email.trim()) {
    const { data } = await admin
      .from("customers")
      .select("id, name, email, phone")
      .eq("tenant_id", tenantId)
      .eq("email", hints.email.trim().toLowerCase())
      .limit(5);
    (data ?? []).forEach((c) => candidates.set(c.id, c));
  }
  if (hints.phone && hints.phone.trim()) {
    const normalized = hints.phone.replace(/\D/g, "");
    if (normalized.length >= 7) {
      const { data } = await admin
        .from("customers")
        .select("id, name, email, phone")
        .eq("tenant_id", tenantId)
        .eq("phone", hints.phone.trim())
        .limit(5);
      (data ?? []).forEach((c) => candidates.set(c.id, c));
    }
  }
  return Array.from(candidates.values());
}
