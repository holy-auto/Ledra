/**
 * 証明書の作成。**Web の Server Action とモバイルの API が同じここを通る。**
 *
 * なぜ切り出したか: モバイルは `certificates` へ直接 insert していたため、
 * ここでやっていること —— テンプレートのスキーマ写し取り、メーカー認定テンプレートの
 * 検証、撮影来歴の nonce 発行、車両履歴・点検所見・部品交換の記録 —— を
 * まるごと飛ばしていた。作成の入口を1つにして、片方だけ直る事故を防ぐ。
 *
 * Server Action（"use server"）のファイルからは非 Action を export できないので、
 * 本体はこのモジュールに置き、actions.ts は薄い包みにする。
 */
import "server-only";

import { resolveStoreId, STORE_ERROR_MESSAGES } from "@/lib/stores/resolveStoreId";
import { linksToReservation } from "@/lib/certificates/linkToReservation";
import { linksToJobOrder } from "@/lib/certificates/linkToJobOrder";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { makePublicId } from "@/lib/publicId";
import { resolveCertifiedTemplateForTenant } from "@/lib/manufacturers/certifiedTemplates";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { recordCoatingConsumableInstallations } from "@/lib/parts/coatingIntegration";
import { issueCaptureNonce } from "@/lib/certificates/captureNonce";
import { parseDamageMap } from "@/lib/certificates/damageMap";
import { parseMileageKm } from "@/lib/maintenance/mileage";

export type CreateCertResult =
  | { ok: true; public_id: string; status: "draft"; photo_required: boolean; capture_nonce: string | null }
  | { ok: false; error: string };

/** 作成に必要な呼び出し元の情報。Web/モバイルで解決の仕方は違うが中身は同じ */
export interface CertCreateCaller {
  userId: string;
  tenantId: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- 移設前のコードをそのまま保つ */
export async function createCertificate(
  supabase: SupabaseClient,
  caller: CertCreateCaller,
  formData: FormData,
): Promise<CreateCertResult> {
  const userId = caller.userId;
  const tenantId = caller.tenantId;

  const template_id = String(formData.get("template_id") || "");
  const template_name = String(formData.get("template_name") || "");

  // Parallelize independent DB reads
  // 発行した店舗。モバイルは選択中の店舗を送る。Web の発行画面は未指定なので、
  // 有効な店舗が1つだけならサーバが入れる（他テナントの店舗 ID は弾く）。
  // テナント・テンプレートの読み取りと独立なので同じ Promise.all に載せる
  const [{ data: tenantRow }, templateResult, resolvedStore] = await Promise.all([
    supabase.from("tenants").select("logo_asset_path").eq("id", tenantId).single(),
    template_id
      ? supabase
          .from("templates")
          .select("schema_json")
          .eq("id", template_id)
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .single()
      : Promise.resolve({ data: null }),
    resolveStoreId(supabase, tenantId, String(formData.get("store_id") || "")),
  ]);

  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;
  const schema_snapshot = templateResult?.data?.schema_json ?? null;

  if (!resolvedStore.ok) return { ok: false, error: STORE_ERROR_MESSAGES[resolvedStore.error] };
  const store_id = resolvedStore.storeId;
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
    // 配列を弾く: `typeof [] === "object"` なので素通りしてしまうが、配列に
    // `.mileage` を代入しても JSON.stringify で消えるため、走行距離が黙って失われる。
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) maintenance_data = parsed;
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

  // Damage map JSON (optional — 傷・損傷位置マップ)。不正・空はマーカー0件として null 化。
  const damage_map_data = parseDamageMap(formData.get("damage_map_json"));

  // Accessory JSON (optional — accessory templates only)
  let accessory_data: Record<string, any> = {};
  try {
    const raw = String(formData.get("accessory_json") || "{}");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) accessory_data = parsed;
  } catch {
    // ignore parse errors — field is optional
  }

  // Service type (ppf | coating | maintenance | body_repair | accessory | etc)
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

  // 走行距離は必須。入庫のたびに読める唯一の客観値で、車両パスポート・残価判定・
  // 整備リマインダー・劣化予測がすべてこの時系列を入力にしている。
  // 任意入力だった間は本番に1件も溜まらなかったため、ここを通さない発行を認めない。
  // Web・モバイル・外部APIはすべてこの関数を通るので、検証はここ1箇所で足りる。
  const mileage_km = parseMileageKm(formData.get("mileage_km"));
  if (mileage_km === null) return { ok: false, error: "mileage_required" };

  // 既存の DB トリガー `trg_sync_mileage_from_certificate` が
  // `maintenance_json->>'mileage'` を読んで `vehicle_mileage_logs` に落とすので、
  // 整備以外の施工種別でもここに載せて配管を再利用する（新テーブルもマイグレーションも不要）。
  // 整備内容ブロックの描画は公開ページ・PDF とも service_type === "maintenance"
  // で閉じているため、コーティング等の証明書に整備欄が出てしまうことはない。
  maintenance_data.mileage = mileage_km;

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
    // 表記揺れ (「山田たろう / ヤマダ タロウ」等) も既存顧客に寄せるため、
    // 完全一致ではなく名寄せ (電話/メール一致 → 氏名類似度) で照合する。
    // バルクではないが単発なので AI 判定はオフ (決定的マッチのみ) で十分。
    const { data: candidates } = await supabase
      .from("customers")
      .select("id, name, name_kana, phone, email")
      .eq("tenant_id", tenantId);

    let matchedId: string | null = null;
    if (candidates && candidates.length > 0) {
      const match = await fuzzyMatchCustomer(
        { query: { name: customer_name }, candidates: candidates as CustomerCandidate[] },
        { ai: false },
      );
      if (match.best && match.confidence >= 0.85) {
        matchedId = match.best.candidate.id;
      }
    }

    if (matchedId) {
      resolvedCustomerId = matchedId;
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
  // 案件フローから渡された reservation_id は一度だけ取得し、職人の解決と「この案件から
  // 発行」リンクの両方に使い回す。
  let reservationFound = false; // テナント内に当該予約が実在するか（車両フォールバックの抑止に使う）
  let linked_reservation_id: string | null = null; // 車両/顧客が一致したときだけ証明書に紐付ける
  if (reservation_id_form) {
    const { data: jobRes } = await supabase
      .from("reservations")
      .select("assigned_staff_id, vehicle_id, customer_id")
      .eq("id", reservation_id_form)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (jobRes) {
      reservationFound = true;
      // 明示指定が無ければ、この案件の担当者をそのまま職人として採用する（最も正確）。
      if (!craftsman_staff_id) craftsman_staff_id = (jobRes.assigned_staff_id as string | null) ?? null;
      // 証明書側で確定した車両/顧客と矛盾しない場合のみ「この案件から発行」とみなす。
      // 取り違え（別案件を「作成済」に誤マーク）を防ぐため、不一致なら紐付けない。
      // 判定は linksToReservation（このファイルの先頭）に切り出してテストしてある
      if (
        linksToReservation(
          {
            vehicle_id: (jobRes.vehicle_id as string | null) ?? null,
            customer_id: (jobRes.customer_id as string | null) ?? null,
          },
          { vehicleId: resolvedVehicleId ?? null, customerId: resolvedCustomerId ?? null },
        )
      ) {
        linked_reservation_id = reservation_id_form;
      }
    }
  }
  if (!craftsman_staff_id && !reservationFound && resolvedVehicleId) {
    // フォールバック: 明示の案件指定が無い場合のみ、この車両の「キャンセルでない・
    // 今日以前」の予約担当を引き当てる。案件が指定されていれば（担当未設定でも）その
    // 案件に従い、車両履歴からの推定は行わない（誤った職人名の刻印を防ぐ）。
    // また最近の該当予約に複数の異なる担当が居る場合も、どの案件向けの証明書か
    // 確定できないため敢えて付けない。
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
  // 外注施工の紐付け: テナント間の発注 (job_orders) から発行された証明書は、その発注に
  // 紐付ける。これで受発注の双方が /admin/orders/[id] の同じ画面から成果物を辿れる。
  // 当事者（発注元 or 受注先）でない発注 ID は無視する。DB 側にも同じ制約のトリガーが
  // あるが、ここで落としておかないと insert ごと失敗して発行が止まる。
  //
  // 取り違えの重さ: **紐付けた証明書は相手方テナントの画面に出る**ので、別の顧客の
  // 証明書が紛れ込むとそのまま他社への誤開示になる。発注導線から入ったあとフォームで
  // 別の車両・顧客に変更しても、発注 ID は hidden で残ってしまう。
  //
  // ただし**ここで機械的に検証できるのは、発注が車両を持っている場合だけ**。
  // job_orders に顧客は無く、vehicle_id も任意（受発注画面 OrdersClient は車両を
  // 送らないので、UI から作られた発注は vehicle_id = NULL）。null 同士を「一致」と
  // みなす linksToReservation をここに流用すると、その最も多いケースで判定が
  // 常に true になり、**チェックしているつもりの素通り**になる。だから流用はやめ、
  // 車両がある発注だけ厳密一致を要求し、無い発注は検証できないものとして扱う。
  // 検証できない側の歯止めは発行フォームの明示（CertNewFormWrapper の紐付け表示）。
  const job_order_id_form = String(formData.get("job_order_id") || "").trim() || null;
  let linked_job_order_id: string | null = null;
  if (job_order_id_form) {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: orderRow } = await admin
      .from("job_orders")
      .select("id, vehicle_id")
      .eq("id", job_order_id_form)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .maybeSingle();
    // 判定は linksToJobOrder に切り出してテストしてある（linksToReservation とは
    // わざと非対称。流用すると vehicle_id = NULL の発注で素通りになる）。
    const vehicleOk = linksToJobOrder(
      { vehicle_id: (orderRow?.vehicle_id as string | null) ?? null },
      { vehicleId: resolvedVehicleId ?? null },
    );
    linked_job_order_id = orderRow?.id && vehicleOk ? job_order_id_form : null;
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
      store_id: store_id ?? undefined,
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
      damage_map_json: damage_map_data ?? null,
      accessory_json: Object.keys(accessory_data).length > 0 ? accessory_data : {},
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
      // 案件から発行された証明書は元の予約に紐付ける（タイムライン/フォローで「作成済」に）。
      // 車両/顧客が一致した検証済みの予約のみ（取り違え防止）。
      reservation_id: linked_reservation_id ?? undefined,
      // 外注施工: 当事者であることを確認できた発注のみ紐付ける。
      job_order_id: linked_job_order_id ?? undefined,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const certificateId = certRow?.id as string | undefined;

  // 撮影時来歴の単回nonceを発行し、成功レスポンスで撮影クライアントへ渡す
  // （写真アップロード時に添付して cert 束縛の新鮮な撮影を証明する）。発行失敗は
  // 発行を止めない（null＝そのテナントは当面 basic 止まり）。これが実運用の作成経路
  // （online フォーム / /api/admin/certificates）で nonce を確実に払い出す箇所。
  const captureNonce = certificateId ? await issueCaptureNonce({ tenantId, certificateId }) : null;

  const now = new Date().toISOString();

  // コーティング剤/PPFフィルムは消耗品として part_installations に記録し、部品交換用の
  // 納品書OCR三方照合・写真重複検知をそのまま流用する（設計: docs/coating-ppf-integrity-design.md）。
  // ベストエフォート: 失敗しても証明書発行はブロックしない。
  if (certificateId && (service_type === "coating" || service_type === "ppf") && coating_products.length > 0) {
    recordCoatingConsumableInstallations(
      tenantId,
      userId,
      { certificateId, vehicleId: resolvedVehicleId ?? null, customerId: resolvedCustomerId ?? null },
      coating_products,
    ).catch((e) => {
      console.error("recordCoatingConsumableInstallations failed", e);
    });
  }
  const mileageKm = mileage_km;

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

  return { ok: true, public_id, status: "draft", photo_required: requestedActive, capture_nonce: captureNonce };
}
