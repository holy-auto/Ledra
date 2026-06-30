/**
 * 部品装着レコードの作成サービス（Phase 2 のインジェスト・バックボーン）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6 / §4 L2,L7
 *
 * 「撮るだけ」で以下を自動実行する:
 *  1. content_hash をサーバ側で算出（クライアント送信値は信用しない）。
 *  2. 生シリアルは保存せず HMAC フィンガープリントのみを part_serial_registry へ登録し、
 *     テナント横断の使い回しを衝突検知（→ serial_reused finding）。
 *  3. 証拠写真の sha256 / 知覚ハッシュが他装着と重複していないか検知（→ photo_duplicate finding）。
 *  4. 検知結果を part_integrity_findings に自動記録（L7）。
 */

import { randomUUID } from "crypto";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { computePartContentHash, serialFingerprint, deriveRequiredAssurance } from "@/lib/parts/contentHash";
import { serialReusedFinding, flagFindingsFromEvidence, type IntegrityFinding } from "@/lib/parts/integrityChecks";
import type { PartInstallationCreateInput } from "@/lib/validations/partInstallation";

export interface CreateInstallationResult {
  installation: {
    id: string;
    status: "installed";
    content_hash: string;
    required_assurance: "customer_otp" | "store_contact_otp" | "any";
  };
  findings: IntegrityFinding[];
}

export async function createInstallation(
  tenantId: string,
  userId: string | null,
  input: PartInstallationCreateInput,
): Promise<CreateInstallationResult> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const installationId = randomUUID();
  const installedAt = new Date().toISOString();
  const nonce = randomUUID();

  // 生シリアルは保存しない: フィンガープリントのみ算出
  const fp = input.serial_no ? serialFingerprint(input.gtin ?? null, input.serial_no) : null;
  const requiredAssurance = deriveRequiredAssurance(input.part_kind, input.amount_jpy ?? null);
  const evidenceSha256 = input.evidence
    .map((e) => e.sha256)
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  // content_hash（確定署名の対象。確定時の本人縛りは Phase 3 で document_hash に封入）
  const contentHash = computePartContentHash({
    tenantId,
    installationId,
    vehicleId: input.vehicle_id ?? null,
    jobOrderId: input.job_order_id ?? null,
    customerId: input.customer_id ?? null,
    customerPhoneFullHash: null,
    partName: input.part_name,
    gtin: input.gtin ?? null,
    lotCode: input.lot_code ?? null,
    serialFingerprint: fp,
    partKind: input.part_kind,
    quantity: input.quantity,
    unit: input.unit,
    amountJpy: input.amount_jpy ?? null,
    evidenceSha256,
    installedAt,
    nonce,
  });

  // 1) 装着レコード（installed）
  const { error: insErr } = await admin.from("part_installations").insert({
    id: installationId,
    tenant_id: tenantId,
    job_order_id: input.job_order_id ?? null,
    reservation_id: input.reservation_id ?? null,
    vehicle_id: input.vehicle_id ?? null,
    customer_id: input.customer_id ?? null,
    inventory_item_id: input.inventory_item_id ?? null,
    part_name: input.part_name,
    gtin: input.gtin ?? null,
    lot_code: input.lot_code ?? null,
    serial_no: null, // 生シリアルは保存しない
    part_kind: input.part_kind,
    quantity: input.quantity,
    unit: input.unit,
    amount_jpy: input.amount_jpy ?? null,
    required_assurance: requiredAssurance,
    status: "installed",
    content_hash: contentHash,
    installed_by: userId,
    installed_at: installedAt,
  });
  if (insErr) throw new Error(`part_installations insert failed: ${insErr.message}`);

  // 2) 証拠
  if (input.evidence.length > 0) {
    const rows = input.evidence.map((e) => ({
      tenant_id: tenantId,
      installation_id: installationId,
      kind: e.kind,
      storage_path: e.storage_path ?? null,
      sha256: e.sha256 ?? null,
      perceptual_hash: e.perceptual_hash ?? null,
      c2pa_verified: e.c2pa_verified ?? false,
      device_attestation_verified: e.device_attestation_verified ?? false,
      authenticity_grade: e.authenticity_grade ?? "unverified",
      exif_captured_at: e.exif_captured_at ?? null,
      capture_nonce: e.capture_nonce ?? null,
      ocr_extracted: e.ocr_extracted ?? null,
    }));
    const { error: evErr } = await admin.from("part_installation_evidence").insert(rows);
    if (evErr) throw new Error(`part_installation_evidence insert failed: ${evErr.message}`);
  }

  const findings: IntegrityFinding[] = [];

  // 3) シリアル横断使い回し検知
  if (fp) {
    const { data: regResult, error: rpcErr } = await admin.rpc("part_register_serial", {
      p_fingerprint: fp,
      p_tenant_id: tenantId,
      p_installation_id: installationId,
    });
    if (rpcErr) throw new Error(`part_register_serial failed: ${rpcErr.message}`);
    if (regResult === "reused") findings.push(serialReusedFinding(installationId, fp));
  }

  // 4) 写真の使い回し検知（同テナント内の他装着と sha256 / 知覚ハッシュが一致）
  const phashes = input.evidence
    .map((e) => e.perceptual_hash)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  if (evidenceSha256.length > 0 || phashes.length > 0) {
    const dup = await findDuplicateEvidence(admin, tenantId, installationId, evidenceSha256, phashes);
    if (dup.length > 0) {
      findings.push({
        installation_id: installationId,
        rule: "photo_duplicate",
        severity: "critical",
        detail: { matches: dup, note: "他の装着と同一の写真（使い回し疑い）" },
      });
    }
  }

  // 4.5) ステージ時 (evidence-upload) に検出した EXIF 改ざん疑い flag → finding
  //      (編集ソフト痕跡 → photo_edited, 撮影時刻異常 → timestamp_anomaly 等)。
  findings.push(...flagFindingsFromEvidence(installationId, input.evidence));

  // 5) findings 記録
  if (findings.length > 0) {
    const { error: fErr } = await admin
      .from("part_integrity_findings")
      .insert(findings.map((f) => ({ tenant_id: tenantId, ...f })));
    if (fErr) throw new Error(`part_integrity_findings insert failed: ${fErr.message}`);
  }

  return {
    installation: {
      id: installationId,
      status: "installed",
      content_hash: contentHash,
      required_assurance: requiredAssurance,
    },
    findings,
  };
}

/** 同テナント内の他装着で同一 sha256/知覚ハッシュの証拠を探す。admin は呼び出し側のものを再利用。 */
async function findDuplicateEvidence(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  selfInstallationId: string,
  sha256s: string[],
  phashes: string[],
): Promise<Array<{ installation_id: string; sha256: string | null; perceptual_hash: string | null }>> {
  // PostgREST の or フィルタへ渡すため、英数字のみに限定（フィルタ・インジェクション防止）。
  const safe = (xs: string[]) => [...new Set(xs.filter((x) => /^[A-Za-z0-9]+$/.test(x)))];
  const safeSha = safe(sha256s);
  const safePhash = safe(phashes);
  const ors: string[] = [];
  if (safeSha.length > 0) ors.push(`sha256.in.(${safeSha.join(",")})`);
  if (safePhash.length > 0) ors.push(`perceptual_hash.in.(${safePhash.join(",")})`);
  if (ors.length === 0) return [];

  const { data, error } = await admin
    .from("part_installation_evidence")
    .select("installation_id, sha256, perceptual_hash")
    .eq("tenant_id", tenantId)
    .neq("installation_id", selfInstallationId)
    .or(ors.join(","))
    .limit(20);

  if (error) throw new Error(`duplicate evidence query failed: ${error.message}`);
  return data ?? [];
}
