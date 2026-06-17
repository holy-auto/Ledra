"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { makePublicId } from "@/lib/publicId";
import { resolveCertifiedTemplateForTenant } from "@/lib/manufacturers/certifiedTemplates";

export type CreateCertResult =
  | { ok: true; public_id: string; status: "draft"; photo_required: boolean }
  | { ok: false; error: string };

export async function createCertAction(formData: FormData): Promise<CreateCertResult> {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;
  if (!userId) return { ok: false, error: "unauthorized" };

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return { ok: false, error: "no_tenant" };

  const template_id = String(formData.get("template_id") || "");
  const template_name = String(formData.get("template_name") || "");

  // Parallelize independent DB reads
  const [{ data: tenantRow }, templateResult] = await Promise.all([
    supabase.from("tenants").select("logo_asset_path").eq("id", tenantId).single(),
    template_id
      ? supabase
          .from("templates")
          .select("schema_json")
          .eq("id", template_id)
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;
  const schema_snapshot = templateResult?.data?.schema_json ?? null;

  const vehicle_id = String(formData.get("vehicle_id") || "").trim() || null;
  const vehicle_maker = String(formData.get("vehicle_maker") || "").trim();
  const vin_code = String(formData.get("vin_code") || "").trim() || null;
  const size_class = String(formData.get("size_class") || "").trim() || null;
  const customer_name = String(formData.get("customer_name") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const plate = String(formData.get("plate") || "").trim();
  const content_free_text = String(formData.get("content_free_text") || "").trim();
  const expiry_value = String(formData.get("expiry_value") || "").trim();

  const customer_id = String(formData.get("customer_id") || "").trim() || null;
  const expiry_date = String(formData.get("expiry_date") || "").trim() || null;
  const warranty_period_end = String(formData.get("warranty_period_end") || "").trim() || null;
  const maintenance_date = String(formData.get("maintenance_date") || "").trim() || null;
  const warranty_exclusions = String(formData.get("warranty_exclusions") || "").trim() || null;
  const remarks = String(formData.get("remarks") || "").trim() || null;

  // Film thickness JSON (optional)
  let film_thickness: any[] = [];
  try {
    const raw = String(formData.get("film_thickness_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) film_thickness = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Coating products JSON (optional)
  let coating_products: any[] = [];
  try {
    const raw = String(formData.get("coating_products_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) coating_products = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // PPF coverage JSON (optional — PPF templates only)
  let ppf_coverage: any[] = [];
  try {
    const raw = String(formData.get("ppf_coverage_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) ppf_coverage = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Maintenance JSON (optional — maintenance templates only)
  let maintenance_data: Record<string, any> = {};
  try {
    const raw = String(formData.get("maintenance_json") || "{}");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) maintenance_data = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Body repair JSON (optional — body_repair templates only)
  let body_repair_data: Record<string, any> = {};
  try {
    const raw = String(formData.get("body_repair_json") || "{}");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) body_repair_data = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Service type (ppf | coating | maintenance | body_repair | etc)
  const service_type = String(formData.get("service_type") || "").trim() || null;

  // 品質監査用のフラットな field_values スナップショット (フォームの collectFieldValues 相当)。
  // アップロード時の自動品質監査 (photo.auto_quality_check) が、誤検知なく
  // 「発行前ゲートと同じ入力」で監査を再現できるよう、作成時に保存しておく。
  let quality_fields: Record<string, string> | null = null;
  try {
    const raw = String(formData.get("quality_fields_json") || "");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string") out[k] = v;
        }
        if (Object.keys(out).length > 0) quality_fields = out;
      }
    }
  } catch {
    // optional — parse 失敗は無視 (品質監査はベストエフォート)
  }

  // 施工パッケージのスナップショット (任意)
  // form 上の hidden input から取り出し、content_preset_json に保存して
  // 「どのパッケージを元に発行されたか」を後追いできるようにする。
  // PR-C 仕様: 案件の menu_items_json はここでは触らない (= 再展開しない)。
  const package_id_form = String(formData.get("package_id") || "").trim() || null;
  let package_snapshot: Record<string, unknown> | null = null;
  if (package_id_form) {
    try {
      const raw = String(formData.get("package_snapshot_json") || "");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") package_snapshot = parsed as Record<string, unknown>;
      }
    } catch {
      // パッケージのトレースは optional のため、parse 失敗は無視する。
    }
  }

  if (!customer_name) return { ok: false, error: "customer_name_required" };
  if (!vehicle_id && !vehicle_maker && !model) return { ok: false, error: "vehicle_required" };

  // メーカー指定デザインを使う場合は、認定施工店であることを必ず再確認する。
  // クライアントから任意の id を差し込まれる可能性に備え、ここを抜くと
  // 偽装発行の口になる。API ルートと同じ resolveCertifiedTemplateForTenant
  // を使うことで両経路で同一のゲートを通す。
  const manufacturer_template_id_form = String(formData.get("manufacturer_template_id") || "").trim() || null;
  let manufacturer_id: string | null = null;
  let manufacturer_template_id: string | null = null;
  if (manufacturer_template_id_form) {
    const resolved = await resolveCertifiedTemplateForTenant(tenantId, manufacturer_template_id_form);
    if (!resolved) {
      return { ok: false, error: "not_certified_for_manufacturer_template" };
    }
    manufacturer_id = resolved.manufacturer.id;
    manufacturer_template_id = resolved.template.id;
  }

  // Auto-create customer record if not linked to existing master
  // (Allows "type-to-create" — name entered freely will be registered to customer master.)
  let resolvedCustomerId = customer_id;
  if (!resolvedCustomerId && customer_name) {
    // Try to find an existing customer with the same name to avoid duplicates
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", customer_name)
      .limit(1)
      .maybeSingle();

    if (existingCustomer?.id) {
      resolvedCustomerId = existingCustomer.id as string;
    } else {
      const { data: newCustomer, error: customerErr } = await supabase
        .from("customers")
        .insert({ tenant_id: tenantId, name: customer_name })
        .select("id")
        .single();
      if (customerErr) {
        console.warn("[cert] auto customer create failed:", customerErr);
      } else if (newCustomer?.id) {
        resolvedCustomerId = newCustomer.id as string;
      }
    }
  }

  // Auto-create vehicle record if not linked to existing master
  let resolvedVehicleId = vehicle_id;
  if (!resolvedVehicleId && (vehicle_maker || model || plate)) {
    // Prefer match on plate (unique-ish per tenant) when provided
    let existingVehicleId: string | null = null;
    if (plate) {
      const { data: byPlate } = await supabase
        .from("vehicles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("plate_display", plate)
        .limit(1)
        .maybeSingle();
      if (byPlate?.id) existingVehicleId = byPlate.id as string;
    }

    if (existingVehicleId) {
      resolvedVehicleId = existingVehicleId;
    } else {
      const { data: newVehicle, error: vehicleErr } = await supabase
        .from("vehicles")
        .insert({
          tenant_id: tenantId,
          maker: vehicle_maker || null,
          model: model || null,
          plate_display: plate || null,
          vin_code: vin_code || null,
          size_class: size_class || null,
          customer_id: resolvedCustomerId ?? null,
        })
        .select("id")
        .single();
      if (vehicleErr) {
        console.warn("[cert] auto vehicle create failed:", vehicleErr);
      } else if (newVehicle?.id) {
        resolvedVehicleId = newVehicle.id as string;
      }
    }
  }

  // If the existing vehicle lacks a customer link but we have one, link it now
  if (resolvedVehicleId && resolvedCustomerId) {
    const { data: currentVehicle } = await supabase
      .from("vehicles")
      .select("customer_id")
      .eq("id", resolvedVehicleId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (currentVehicle && !currentVehicle.customer_id) {
      await supabase
        .from("vehicles")
        .update({ customer_id: resolvedCustomerId })
        .eq("id", resolvedVehicleId)
        .eq("tenant_id", tenantId);
    }
  }

  // Collect template field values
  const values: Record<string, any> = {};
  for (const [k, v] of formData.entries()) {
    const key = String(k);
    if (!key.startsWith("f__")) continue;
    const fkey = key.slice(3);
    if (v === "on") {
      values[fkey] = true;
      continue;
    }
    const sv = String(v);
    if (values[fkey] === undefined) values[fkey] = sv;
    else if (Array.isArray(values[fkey])) values[fkey].push(sv);
    else values[fkey] = [values[fkey], sv];
  }

  const public_id = makePublicId();

  // 写真添付必須ルール: 新規作成時点では写真が 0 枚のため、ここでは必ず
  // draft として作成する。発行 (active 化) は写真アップロード後に活性化
  // チョークポイント (PUT /api/admin/certificates/status) で行う。
  // status=active を要求された場合は「発行希望」とみなし photo_required を返す。
  const statusParam = String(formData.get("status") || "active").trim();
  const requestedActive = statusParam !== "draft";

  // ⑦ 職人名×施工証明: 施工担当（職人）を解決。明示指定 (craftsman_staff_id) を優先し、
  // 無ければこの車両に紐づく直近の予約 (assigned_staff_id) から引き当てる。
  // 発行時点の表示名をスナップショットして証明書に刻む（退会後も証跡が残る）。
  // 案件フローから reservation_id が渡っていれば、その予約の担当を最優先で使う（最も正確）。
  const reservation_id_form = String(formData.get("reservation_id") || "").trim() || null;
  let craftsman_staff_id = String(formData.get("craftsman_staff_id") || "").trim() || null;
  if (!craftsman_staff_id && reservation_id_form) {
    const { data: jobRes } = await supabase
      .from("reservations")
      .select("assigned_staff_id")
      .eq("id", reservation_id_form)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    craftsman_staff_id = (jobRes?.assigned_staff_id as string | null) ?? null;
  }
  if (!craftsman_staff_id && resolvedVehicleId) {
    // フォールバック: この車両の「キャンセルでない・今日以前」の予約担当を引き当てる。
    // ただし最近の該当予約に複数の異なる担当が居る場合は、どの案件向けの証明書か
    // 確定できないため敢えて付けない（誤った職人名の刻印を防ぐ）。
    const cutoff = new Date().toISOString().slice(0, 10);
    const { data: recentRows } = await supabase
      .from("reservations")
      .select("assigned_staff_id")
      .eq("tenant_id", tenantId)
      .eq("vehicle_id", resolvedVehicleId)
      .not("assigned_staff_id", "is", null)
      .neq("status", "cancelled")
      .lte("scheduled_date", cutoff)
      .order("scheduled_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);
    const distinct = [...new Set((recentRows ?? []).map((r) => r.assigned_staff_id as string).filter(Boolean))];
    craftsman_staff_id = distinct.length === 1 ? distinct[0] : null;
  }
  let craftsman_name: string | null = null;
  if (craftsman_staff_id) {
    // staff_members の SELECT は RLS で管理ロール限定のため、発行者が staff ロール
    // でも職人名を解決できるよう、サービスロールで tenant 限定 + name のみ読む。
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: staffRow } = await admin
      .from("staff_members")
      .select("name")
      .eq("id", craftsman_staff_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    craftsman_name = (staffRow?.name as string | null) ?? null;
    if (!craftsman_name) craftsman_staff_id = null; // 不整合なら付けない
  }

  const { data: certRow, error } = await supabase
    .from("certificates")
    .insert({
      tenant_id: tenantId,
      public_id,
      status: "draft",
      customer_name,
      customer_id: resolvedCustomerId ?? undefined,
      vehicle_id: resolvedVehicleId ?? undefined,
      vehicle_info_json: { maker: vehicle_maker, model, plate },
      content_free_text,
      content_preset_json: {
        template_id,
        template_name,
        schema_snapshot,
        values,
        ...(film_thickness.length > 0 ? { film_thickness } : {}),
        ...(package_id_form ? { package_id: package_id_form } : {}),
        ...(package_snapshot ? { package_snapshot } : {}),
      },
      coating_products_json: coating_products.length > 0 ? coating_products : [],
      ppf_coverage_json: ppf_coverage.length > 0 ? ppf_coverage : [],
      maintenance_json: Object.keys(maintenance_data).length > 0 ? maintenance_data : {},
      body_repair_json: Object.keys(body_repair_data).length > 0 ? body_repair_data : {},
      service_type: service_type || null,
      quality_fields_json: quality_fields,
      expiry_type: "text",
      expiry_value,
      expiry_date: expiry_date || null,
      warranty_period_end: warranty_period_end || null,
      maintenance_date: maintenance_date || null,
      warranty_exclusions: warranty_exclusions || null,
      remarks: remarks || null,
      footer_variant: "holy",
      logo_asset_path: tenantLogoPath,
      manufacturer_id,
      manufacturer_template_id,
      created_by: userId,
      craftsman_staff_id: craftsman_staff_id ?? undefined,
      craftsman_name: craftsman_name ?? undefined,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const certificateId = certRow?.id as string | undefined;
  const now = new Date().toISOString();
  const mileageKm = maintenance_data.mileage ? parseInt(String(maintenance_data.mileage), 10) : null;

  // Structured inspection findings → vehicle_inspection_findings
  let structured_findings: any[] = [];
  try {
    const raw = String(formData.get("inspection_findings_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) structured_findings = parsed;
  } catch {
    /* ignore */
  }

  // Structured part replacements → vehicle_part_replacements
  let structured_parts: any[] = [];
  try {
    const raw = String(formData.get("part_replacements_json") || "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) structured_parts = parsed;
  } catch {
    /* ignore */
  }

  if (resolvedVehicleId && certificateId) {
    // Supabase query builders are PromiseLike (thenable) but not full Promises;
    // type as PromiseLike so .insert() builders can be collected and awaited via
    // Promise.all below. (Fixes a pre-existing tsc error surfaced on main.)
    const sideEffects: PromiseLike<any>[] = [];

    if (structured_findings.length > 0) {
      sideEffects.push(
        supabase.from("vehicle_inspection_findings").insert(
          structured_findings.map((f) => ({
            tenant_id: tenantId,
            vehicle_id: resolvedVehicleId,
            certificate_id: certificateId,
            mileage_km: mileageKm ?? null,
            finding_category: f.finding_category,
            finding_severity: f.finding_severity ?? "ok",
            finding_code: f.finding_code ?? null,
            finding_note: f.finding_note ?? null,
            inspected_at: now,
          })),
        ),
      );
    }

    if (structured_parts.length > 0) {
      sideEffects.push(
        supabase.from("vehicle_part_replacements").insert(
          structured_parts.map((p) => ({
            tenant_id: tenantId,
            vehicle_id: resolvedVehicleId,
            certificate_id: certificateId,
            part_category: p.part_category,
            part_name: p.part_name,
            mileage_at_replacement: mileageKm ?? null,
            replaced_at: now,
            next_replacement_mileage_est: p.next_replacement_mileage_est ?? null,
          })),
        ),
      );
    }

    sideEffects.push(
      supabase.from("vehicle_histories").insert({
        tenant_id: tenantId,
        vehicle_id: resolvedVehicleId,
        type: "certificate_issued",
        title: "施工証明書を発行",
        description: `Public ID: ${public_id}`,
        performed_at: now,
        certificate_id: null,
      }),
    );

    await Promise.all(sideEffects);
  } else if (resolvedVehicleId) {
    await supabase.from("vehicle_histories").insert({
      tenant_id: tenantId,
      vehicle_id: resolvedVehicleId,
      type: "certificate_issued",
      title: "施工証明書を発行",
      description: `Public ID: ${public_id}`,
      performed_at: now,
      certificate_id: null,
    });
  }

  // 発行 (active 化) 時の副作用 (保険案件 enqueue / フォローアップ) は、
  // 写真アップロード後の活性化チョークポイントで triggerCertificateIssued
  // として発火する (issueHooks.ts)。ここ (draft 作成時) では発火しない。

  return { ok: true, public_id, status: "draft", photo_required: requestedActive };
}
