/**
 * 証明書発行 JSON API のスキーマ + アダプタ。
 *
 * Server Action (`createCertAction` in app/admin/certificates/new/actions.ts) は
 * FormData を受け取って 380 行の処理を行う。本ファイルはその挙動を変えずに
 * JSON エントリポイントから呼べるようにするための **薄い変換層** に徹する。
 *
 * 設計原則:
 *   - Server Action 側の field 名と完全一致させる (typo は両方で同じバグになる)
 *   - 任意フィールドは undefined を許容し、jsonToCertFormData では空文字をセット
 *     しない (Server Action 側の `formData.get(...) || ""` パターンに合わせる)
 *   - JSON で素直に表現できないネスト構造は `*_json` フィールドにシリアライズして渡す
 *   - 入力検証は Server Action 側の business rule に従属する (本層では型と長さのみ)
 */

import { z } from "zod";

/**
 * 証明書発行リクエストの JSON 形式。
 *
 * オフライン同期と外部連携の両方が同じスキーマを使う想定。
 */
export const certCreateJsonSchema = z
  .object({
    // 顧客
    customer_id: z.string().uuid().nullable().optional(),
    customer_name: z.string().trim().min(1, "顧客名は必須です。").max(200),

    // 車両 (vehicle_id を渡すか、新規入力か、両方可)
    vehicle_id: z.string().uuid().nullable().optional(),
    vehicle_maker: z.string().trim().max(100).optional().default(""),
    model: z.string().trim().max(200).optional().default(""),
    plate: z.string().trim().max(50).optional().default(""),
    vin_code: z.string().trim().max(50).nullable().optional(),
    size_class: z.string().trim().max(20).nullable().optional(),

    // テンプレート
    template_id: z.string().uuid().optional().default(""),
    template_name: z.string().trim().max(200).optional().default(""),
    manufacturer_template_id: z.string().uuid().nullable().optional(),

    // 施工内容
    service_type: z.string().trim().max(50).nullable().optional(),
    content_free_text: z.string().trim().max(5000).optional().default(""),
    expiry_value: z.string().trim().max(100).optional().default(""),
    expiry_date: z.string().trim().nullable().optional(),
    warranty_period_end: z.string().trim().nullable().optional(),
    maintenance_date: z.string().trim().nullable().optional(),
    warranty_exclusions: z.string().trim().max(2000).nullable().optional(),
    remarks: z.string().trim().max(2000).nullable().optional(),

    // ネスト JSON: そのまま *_json として渡す
    film_thickness_json: z.array(z.unknown()).optional(),
    coating_products_json: z.array(z.unknown()).optional(),
    ppf_coverage_json: z.array(z.unknown()).optional(),
    maintenance_json: z.record(z.string(), z.unknown()).optional(),
    body_repair_json: z.record(z.string(), z.unknown()).optional(),

    // パッケージ
    package_id: z.string().uuid().nullable().optional(),
    package_snapshot_json: z.unknown().optional(),

    // テンプレートフィールド (Server Action 側で `f__` プレフィックスで読む)
    template_fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])).optional(),

    // ステータス: draft or active
    status: z.enum(["draft", "active"]).optional().default("active"),
  })
  .strict();

export type CertCreateJsonInput = z.infer<typeof certCreateJsonSchema>;

/**
 * 既存 Server Action `createCertAction` が期待する FormData に変換する。
 *
 * - null / undefined のフィールドは append しない (Server Action 側の
 *   `formData.get(...) || ""` パターンと整合)
 * - ネスト JSON は JSON.stringify して append (Server Action 側で JSON.parse する)
 * - template_fields は `f__<key>` の prefix を付けて展開
 */
export function jsonToCertFormData(input: CertCreateJsonInput): FormData {
  const fd = new FormData();
  const appendIf = (key: string, value: string | null | undefined): void => {
    if (value == null || value === "") return;
    fd.append(key, value);
  };

  // Customer / vehicle
  appendIf("customer_id", input.customer_id ?? undefined);
  appendIf("customer_name", input.customer_name);
  appendIf("vehicle_id", input.vehicle_id ?? undefined);
  appendIf("vehicle_maker", input.vehicle_maker);
  appendIf("model", input.model);
  appendIf("plate", input.plate);
  appendIf("vin_code", input.vin_code ?? undefined);
  appendIf("size_class", input.size_class ?? undefined);

  // Template
  appendIf("template_id", input.template_id);
  appendIf("template_name", input.template_name);
  appendIf("manufacturer_template_id", input.manufacturer_template_id ?? undefined);

  // Service contents
  appendIf("service_type", input.service_type ?? undefined);
  appendIf("content_free_text", input.content_free_text);
  appendIf("expiry_value", input.expiry_value);
  appendIf("expiry_date", input.expiry_date ?? undefined);
  appendIf("warranty_period_end", input.warranty_period_end ?? undefined);
  appendIf("maintenance_date", input.maintenance_date ?? undefined);
  appendIf("warranty_exclusions", input.warranty_exclusions ?? undefined);
  appendIf("remarks", input.remarks ?? undefined);

  // Nested JSON fields (Server Action does JSON.parse on these)
  if (input.film_thickness_json) {
    fd.append("film_thickness_json", JSON.stringify(input.film_thickness_json));
  }
  if (input.coating_products_json) {
    fd.append("coating_products_json", JSON.stringify(input.coating_products_json));
  }
  if (input.ppf_coverage_json) {
    fd.append("ppf_coverage_json", JSON.stringify(input.ppf_coverage_json));
  }
  if (input.maintenance_json) {
    fd.append("maintenance_json", JSON.stringify(input.maintenance_json));
  }
  if (input.body_repair_json) {
    fd.append("body_repair_json", JSON.stringify(input.body_repair_json));
  }

  // Package
  appendIf("package_id", input.package_id ?? undefined);
  if (input.package_snapshot_json !== undefined) {
    fd.append("package_snapshot_json", JSON.stringify(input.package_snapshot_json));
  }

  // Template fields (f__ prefix). Server Action expects multi-value as repeated appends
  // and "on" string for booleans.
  if (input.template_fields) {
    for (const [k, v] of Object.entries(input.template_fields)) {
      const key = `f__${k}`;
      if (typeof v === "boolean") {
        if (v) fd.append(key, "on");
      } else if (Array.isArray(v)) {
        for (const item of v) fd.append(key, String(item));
      } else {
        fd.append(key, String(v));
      }
    }
  }

  // Status
  fd.append("status", input.status);

  return fd;
}
