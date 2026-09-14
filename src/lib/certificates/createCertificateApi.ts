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
import { parseMileageKm } from "@/lib/maintenance/mileage";

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

    // 発行した店舗。モバイルは選択中の店舗を送る（Web は未指定＝null のまま）
    store_id: z.string().uuid().nullable().optional(),

    // 車両 (vehicle_id を渡すか、新規入力か、両方可)
    vehicle_id: z.string().uuid().nullable().optional(),
    vehicle_maker: z.string().trim().max(100).optional().default(""),
    model: z.string().trim().max(200).optional().default(""),
    plate: z.string().trim().max(50).optional().default(""),
    vin_code: z.string().trim().max(50).nullable().optional(),
    size_class: z.string().trim().max(20).nullable().optional(),

    // 走行距離（必須）。Server Action 側の parseMileageKm と同じ条件で弾く。
    // オフライン同期も外部連携もこのスキーマを通るので、ここを optional にすると
    // フォームだけ必須・API は素通り、という抜け道になる。
    mileage_km: z
      .union([z.number(), z.string()])
      .refine((v) => parseMileageKm(v) !== null, "走行距離（km）は必須です。1以上の整数で入力してください。")
      .transform((v) => parseMileageKm(v) as number),

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

    // 品質監査用のフラットな field_values スナップショット (フォームの collectFieldValues 相当)。
    // アップロード時の自動品質監査 (photo.auto_quality_check) が誤検知なく再現するために保存する。
    quality_fields_json: z.record(z.string(), z.string()).optional(),

    // ネスト JSON: そのまま *_json として渡す
    film_thickness_json: z.array(z.unknown()).optional(),
    coating_products_json: z.array(z.unknown()).optional(),
    ppf_coverage_json: z.array(z.unknown()).optional(),
    maintenance_json: z.record(z.string(), z.unknown()).optional(),
    body_repair_json: z.record(z.string(), z.unknown()).optional(),
    damage_map_json: z.record(z.string(), z.unknown()).nullable().optional(),
    accessory_json: z.record(z.string(), z.unknown()).optional(),

    // パッケージ
    package_id: z.string().uuid().nullable().optional(),
    package_snapshot_json: z.unknown().optional(),

    // テンプレートフィールド (Server Action 側で `f__` プレフィックスで読む)
    template_fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])).optional(),

    // 案件連携: 発行元の予約 ID と施工担当（職人）。Server Action 側で職人の解決と
    // 予約への紐付け（タイムラインの「作成済」化）に使う。オフライン同期でも欠落
    // しないよう、FormData ↔ JSON の round-trip に含める。
    reservation_id: z.string().uuid().nullable().optional(),
    craftsman_staff_id: z.string().uuid().nullable().optional(),
    // 外注施工: テナント間の発注 (job_orders) から発行した場合の紐付け先。
    job_order_id: z.string().uuid().nullable().optional(),

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
  appendIf("store_id", input.store_id ?? undefined);
  appendIf("vehicle_id", input.vehicle_id ?? undefined);
  appendIf("vehicle_maker", input.vehicle_maker);
  appendIf("model", input.model);
  appendIf("plate", input.plate);
  appendIf("vin_code", input.vin_code ?? undefined);
  appendIf("size_class", input.size_class ?? undefined);
  appendIf("mileage_km", String(input.mileage_km));

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
  if (input.quality_fields_json && Object.keys(input.quality_fields_json).length > 0) {
    fd.append("quality_fields_json", JSON.stringify(input.quality_fields_json));
  }

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
  if (input.damage_map_json) {
    fd.append("damage_map_json", JSON.stringify(input.damage_map_json));
  }
  if (input.accessory_json) {
    fd.append("accessory_json", JSON.stringify(input.accessory_json));
  }

  // Package
  appendIf("package_id", input.package_id ?? undefined);
  if (input.package_snapshot_json !== undefined) {
    fd.append("package_snapshot_json", JSON.stringify(input.package_snapshot_json));
  }

  // 案件連携 (職人解決 / 予約紐付け)
  appendIf("reservation_id", input.reservation_id ?? undefined);
  appendIf("craftsman_staff_id", input.craftsman_staff_id ?? undefined);
  appendIf("job_order_id", input.job_order_id ?? undefined);

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

/**
 * フォームの FormData から `certCreateJsonSchema` に流せる JSON を作る。
 * `jsonToCertFormData` の逆変換。クライアントで Server Action 用に組み立てた
 * FormData をそのまま JSON API へ送りたいときに使う (オフラインキュー用)。
 *
 * `f__<key>` プレフィックスは `template_fields` に集約する。
 * 配列フィールド (`getAll`) も拾う。
 * 値が無いキーは含めない (Zod の任意フィールドが優先される)。
 */
export function formDataToCertJson(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const templateFields: Record<string, unknown> = {};

  // 1. template_fields (f__) を最初に集約
  for (const key of new Set(Array.from(fd.keys()))) {
    if (!key.startsWith("f__")) continue;
    const fkey = key.slice(3);
    const values = fd.getAll(key);
    if (values.length === 0) continue;
    if (values.length === 1) {
      const v = values[0];
      // "on" は checkbox の boolean true 相当 (Server Action の挙動と整合)
      templateFields[fkey] = v === "on" ? true : String(v);
    } else {
      templateFields[fkey] = values.map((v) => String(v));
    }
  }
  if (Object.keys(templateFields).length > 0) {
    out.template_fields = templateFields;
  }

  // 2. 通常フィールドを拾う (f__ プレフィックスはスキップ)
  const jsonFields = new Set([
    "film_thickness_json",
    "coating_products_json",
    "ppf_coverage_json",
    "maintenance_json",
    "body_repair_json",
    "damage_map_json",
    "accessory_json",
    "package_snapshot_json",
    "quality_fields_json",
  ]);
  const stringFields = [
    "customer_id",
    "customer_name",
    "vehicle_id",
    "vehicle_maker",
    "model",
    "plate",
    "vin_code",
    "size_class",
    "mileage_km",
    "template_id",
    "template_name",
    "manufacturer_template_id",
    "service_type",
    "content_free_text",
    "expiry_value",
    "expiry_date",
    "warranty_period_end",
    "maintenance_date",
    "warranty_exclusions",
    "remarks",
    "package_id",
    "reservation_id",
    "craftsman_staff_id",
    "job_order_id",
    "status",
  ] as const;

  for (const k of stringFields) {
    const v = fd.get(k);
    if (v != null && v !== "") out[k] = String(v);
  }

  for (const k of jsonFields) {
    const v = fd.get(k);
    if (v == null || v === "") continue;
    try {
      out[k] = JSON.parse(String(v));
    } catch {
      // パース不能なら無視 (Zod 側で型チェック)
    }
  }

  return out;
}
