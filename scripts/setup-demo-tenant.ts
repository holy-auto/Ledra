/**
 * setup-demo-tenant.ts
 *
 * デモ施工店テナント "Ledra Motors" をセットアップ（upsert）します。
 * マーケ素材の製品スクリーンショット撮影、パートナーデモ、新規メンバー研修に
 * 使うことを想定しています。
 *
 * 前提:
 *   - SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が env に設定されていること
 *
 * 実行:
 *   npx tsx scripts/setup-demo-tenant.ts
 *
 * 冪等性:
 *   - 既知の UUID/slug を再利用しているので、何度実行してもレコードは重複しない
 *   - 再実行すると、各レコードが最新のシード内容に更新される
 *
 * クリーンアップ:
 *   npx tsx scripts/setup-demo-tenant.ts --reset
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── 固定 ID（再実行しても同じレコードを上書き）─────────────
const TENANT_ID = "00000000-0000-0000-0000-de0000000010";
const TENANT_SLUG = "ledra-motors-demo";

function uuid(ns: string, n: number): string {
  // Derive a stable UUID-shaped identifier. Postgres validates the final
  // 12-char block as hex, so we sanitize non-hex chars in the namespace to
  // '0' — this keeps the uuid well-formed regardless of what label we
  // chose for the namespace.
  const hex = ns.replace(/[^0-9a-f]/gi, "0").padStart(4, "0").slice(0, 4);
  const idx = String(n).padStart(8, "0").slice(-8);
  return `00000000-0000-0000-0000-${hex}${idx}`;
}

// ─── Seed data ─────────────────────────────────────────────

const TENANT = {
  id: TENANT_ID,
  name: "Ledra Motors（デモ）",
  slug: TENANT_SLUG,
  plan_tier: "pro" as const,
  is_active: true,
  contact_email: "demo@ledra-motors.example",
  contact_phone: "03-0000-0000",
  address: "東京都港区南青山 0-0-0 Ledra ビル 1F",
  website_url: "https://demo.ledra.co.jp",
};

type Customer = {
  idn: number;
  name: string;
  name_kana: string;
  email: string;
  phone: string;
  postal_code: string;
  address: string;
  note?: string;
};

const CUSTOMERS: Customer[] = [
  { idn: 1, name: "山田 太郎",  name_kana: "ヤマダ タロウ",  email: "yamada@example.com",  phone: "090-1000-0001", postal_code: "150-0001", address: "東京都渋谷区神宮前 1-1-1", note: "リピーター、ガラスコーティング推し" },
  { idn: 2, name: "佐藤 花子",  name_kana: "サトウ ハナコ",  email: "sato@example.com",    phone: "090-1000-0002", postal_code: "106-0032", address: "東京都港区六本木 2-2-2" },
  { idn: 3, name: "鈴木 一郎",  name_kana: "スズキ イチロウ", email: "suzuki@example.com",  phone: "090-1000-0003", postal_code: "107-0052", address: "東京都港区赤坂 3-3-3", note: "社用車複数台を順次入庫予定" },
  { idn: 4, name: "高橋 由美",  name_kana: "タカハシ ユミ",  email: "takahashi@example.com", phone: "090-1000-0004", postal_code: "153-0061", address: "東京都目黒区中目黒 4-4-4" },
  { idn: 5, name: "田中 健二",  name_kana: "タナカ ケンジ",  email: "tanaka@example.com",  phone: "090-1000-0005", postal_code: "160-0022", address: "東京都新宿区新宿 5-5-5" },
  { idn: 6, name: "渡辺 美咲",  name_kana: "ワタナベ ミサキ", email: "watanabe@example.com", phone: "090-1000-0006", postal_code: "102-0093", address: "東京都千代田区平河町 6-6-6" },
  { idn: 7, name: "伊藤 裕介",  name_kana: "イトウ ユウスケ", email: "ito@example.com",     phone: "090-1000-0007", postal_code: "141-0022", address: "東京都品川区東五反田 7-7-7" },
  { idn: 8, name: "小林 あかね", name_kana: "コバヤシ アカネ", email: "kobayashi@example.com", phone: "090-1000-0008", postal_code: "158-0094", address: "東京都世田谷区玉川 8-8-8" },
];

type Vehicle = {
  idn: number;
  customerIdn: number;
  maker: string;
  model: string;
  year: number;
  plate_display: string;
  notes?: string;
};

const VEHICLES: Vehicle[] = [
  { idn: 1,  customerIdn: 1, maker: "TOYOTA",  model: "クラウン 2.5 RS",        year: 2023, plate_display: "品川 330 あ 12-34" },
  { idn: 2,  customerIdn: 1, maker: "LEXUS",   model: "RX 500h F SPORT",       year: 2024, plate_display: "品川 330 あ 56-78", notes: "納車後すぐの施工依頼" },
  { idn: 3,  customerIdn: 2, maker: "HONDA",   model: "ステップワゴン e:HEV",   year: 2022, plate_display: "世田谷 500 は 34-56" },
  { idn: 4,  customerIdn: 3, maker: "NISSAN",  model: "セレナ e-POWER",        year: 2023, plate_display: "練馬 500 か 22-33" },
  { idn: 5,  customerIdn: 3, maker: "MAZDA",   model: "CX-60 XD L Package",    year: 2024, plate_display: "練馬 500 か 44-55" },
  { idn: 6,  customerIdn: 4, maker: "BMW",     model: "5シリーズ 523d",        year: 2021, plate_display: "足立 300 さ 11-22" },
  { idn: 7,  customerIdn: 5, maker: "SUBARU",  model: "レヴォーグ STI Sport",  year: 2024, plate_display: "多摩 300 さ 77-88", notes: "フロントのみガラスフィルム施工" },
  { idn: 8,  customerIdn: 6, maker: "TOYOTA",  model: "プリウス 2.0 Z",        year: 2023, plate_display: "品川 500 さ 66-77" },
  { idn: 9,  customerIdn: 7, maker: "MERCEDES", model: "GLA 200d",            year: 2022, plate_display: "港 300 さ 99-00" },
  { idn: 10, customerIdn: 8, maker: "LEXUS",   model: "NX 350h Version L",     year: 2024, plate_display: "品川 500 さ 88-99", notes: "セラミックコーティングご希望" },
];

type Cert = {
  idn: number;
  vehicleIdn: number;
  public_id: string;
  service_type: string;
  preset_title: string;
  preset_products?: string[];
  certificate_no: string;
  status?: "active" | "void";
  daysAgo: number;
};

const CERTS: Cert[] = [
  { idn: 1,  vehicleIdn: 1,  public_id: "LEDRA-DEMO-0001", service_type: "glass-coating",    preset_title: "プレミアムガラスコーティング",    preset_products: ["9H Premium", "ホイールガラスコート"],            certificate_no: "2026-LDM-0001", daysAgo: 86 },
  { idn: 2,  vehicleIdn: 2,  public_id: "LEDRA-DEMO-0002", service_type: "ceramic-coating",  preset_title: "セラミックコーティング（8層仕上げ）", preset_products: ["Ceramic Pro 9H", "Top Coat Light"],            certificate_no: "2026-LDM-0002", daysAgo: 72 },
  { idn: 3,  vehicleIdn: 3,  public_id: "LEDRA-DEMO-0003", service_type: "film-protection",  preset_title: "ヘッドライトプロテクション（PPF）", preset_products: ["XPEL Ultimate Plus"],                           certificate_no: "2026-LDM-0003", daysAgo: 65 },
  { idn: 4,  vehicleIdn: 4,  public_id: "LEDRA-DEMO-0004", service_type: "glass-coating",    preset_title: "撥水ガラスコーティング",          preset_products: ["Aqua Repel"],                                    certificate_no: "2026-LDM-0004", daysAgo: 58 },
  { idn: 5,  vehicleIdn: 5,  public_id: "LEDRA-DEMO-0005", service_type: "wrap-full",        preset_title: "フルラッピング（マットブラック）", preset_products: ["3M 2080 Matte Black"],                           certificate_no: "2026-LDM-0005", daysAgo: 52 },
  { idn: 6,  vehicleIdn: 6,  public_id: "LEDRA-DEMO-0006", service_type: "interior-care",    preset_title: "本革シートメンテナンス",          preset_products: ["Leather Balm"],                                 certificate_no: "2026-LDM-0006", daysAgo: 48 },
  { idn: 7,  vehicleIdn: 7,  public_id: "LEDRA-DEMO-0007", service_type: "film-window",      preset_title: "ウィンドウフィルム（IR-05 可視光）", preset_products: ["IKC IR-05"],                                    certificate_no: "2026-LDM-0007", daysAgo: 41 },
  { idn: 8,  vehicleIdn: 8,  public_id: "LEDRA-DEMO-0008", service_type: "glass-coating",    preset_title: "ガラスコーティング（スタンダード）", preset_products: ["9H Standard"],                                 certificate_no: "2026-LDM-0008", daysAgo: 34 },
  { idn: 9,  vehicleIdn: 9,  public_id: "LEDRA-DEMO-0009", service_type: "detailing",       preset_title: "ファインディティーリング",        preset_products: ["Clay Bar", "Polish Stage 1", "Finishing Wax"],  certificate_no: "2026-LDM-0009", daysAgo: 27 },
  { idn: 10, vehicleIdn: 10, public_id: "LEDRA-DEMO-0010", service_type: "ceramic-coating",  preset_title: "セラミックコーティング（5年保証）", preset_products: ["Ceramic Pro Sport"],                           certificate_no: "2026-LDM-0010", daysAgo: 21 },
  { idn: 11, vehicleIdn: 2,  public_id: "LEDRA-DEMO-0011", service_type: "glass-coating",    preset_title: "ボディガラスコーティング再施工", preset_products: ["9H Maintenance"],                                certificate_no: "2026-LDM-0011", daysAgo: 17 },
  { idn: 12, vehicleIdn: 5,  public_id: "LEDRA-DEMO-0012", service_type: "film-protection",  preset_title: "フロントバンパーPPF",           preset_products: ["SunTek Ultra"],                                  certificate_no: "2026-LDM-0012", daysAgo: 14 },
  { idn: 13, vehicleIdn: 1,  public_id: "LEDRA-DEMO-0013", service_type: "detailing",       preset_title: "ホイール脱着・内側コーティング",   preset_products: ["Wheel Ceramic"],                                certificate_no: "2026-LDM-0013", daysAgo: 10 },
  { idn: 14, vehicleIdn: 3,  public_id: "LEDRA-DEMO-0014", service_type: "interior-care",    preset_title: "ファブリックシートクリーニング", preset_products: ["Fabric Guard Pro"],                              certificate_no: "2026-LDM-0014", daysAgo: 6 },
  { idn: 15, vehicleIdn: 10, public_id: "LEDRA-DEMO-0015", service_type: "ceramic-coating",  preset_title: "ホイールセラミックコーティング", preset_products: ["Wheel Ceramic Pro"],                             certificate_no: "2026-LDM-0015", daysAgo: 2 },
  { idn: 16, vehicleIdn: 8,  public_id: "LEDRA-DEMO-0016", service_type: "glass-coating",    preset_title: "新車同時施工 ガラスコート",      preset_products: ["9H Premium", "Maintenance Kit"],                 certificate_no: "2026-LDM-0016", daysAgo: 1 },
];

// ─── Helpers ──────────────────────────────────────────────

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function upsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  opts: { typeColumn?: string } = {},
): Promise<void> {
  // Schema drift is common across Supabase projects (columns added / removed
  // by later migrations, or CHECK constraints narrower than the TS union).
  // Strategies, tried in order, up to 8 attempts:
  //   1) Strip columns the schema cache reports as missing (PGRST204)
  //   2) If a CHECK constraint fails and we know the type column, drop
  //      every row whose type value was implicated
  let current = rows as Record<string, unknown>[];
  const droppedCols = new Set<string>();
  const droppedTypes = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt++) {
    if (current.length === 0) {
      if (droppedCols.size > 0) {
        console.log(`  ℹ️ schema に無いカラムをスキップ: ${[...droppedCols].join(", ")}`);
      }
      if (droppedTypes.size > 0) {
        console.log(`  ℹ️ check 制約で許可されない type をスキップ: ${[...droppedTypes].join(", ")}`);
      }
      console.log(`  (全行がスキップされました)`);
      return;
    }
    const { error } = await admin.from(table).upsert(current, { onConflict });
    if (!error) {
      if (droppedCols.size > 0) {
        console.log(`  ℹ️ schema に無いカラムをスキップ: ${[...droppedCols].join(", ")}`);
      }
      if (droppedTypes.size > 0) {
        console.log(`  ℹ️ check 制約で許可されない type をスキップ: ${[...droppedTypes].join(", ")}`);
      }
      return;
    }

    // 1) Missing column: PGRST204
    const missingColumn = error.message.match(/Could not find the '([^']+)' column/);
    if (missingColumn && !droppedCols.has(missingColumn[1])) {
      const col = missingColumn[1];
      droppedCols.add(col);
      current = current.map((row) => {
        const copy = { ...row };
        delete copy[col];
        return copy;
      });
      continue;
    }

    // 2) CHECK violation on the type column
    if (opts.typeColumn && /check constraint/i.test(error.message)) {
      // Extract the offending row's type from the `details` field when
      // available (PostgREST passes it through as JSON in error.details
      // OR concatenated into error.message as "Failing row contains (...)")
      const typeVal = extractFailingTypeValue(error, opts.typeColumn, current);
      if (typeVal && !droppedTypes.has(typeVal)) {
        droppedTypes.add(typeVal);
        current = current.filter((r) => r[opts.typeColumn!] !== typeVal);
        continue;
      }
    }

    console.error(`❌ ${table} upsert failed:`, error.message);
    throw error;
  }
  throw new Error(`${table} upsert: too many schema mismatches`);
}

function extractFailingTypeValue(
  error: { message: string; details?: string | null },
  typeColumn: string,
  rows: Record<string, unknown>[],
): string | null {
  // Prefer the "Failing row contains (...)" tail, which lists column values
  // in declaration order. We don't know the precise position of the type
  // column here, so fall back to matching against the known set of types in
  // `rows` — whichever value appears in the failing row is the offender.
  const text = `${error.message} ${error.details ?? ""}`;
  const candidates = new Set<string>(rows.map((r) => String(r[typeColumn] ?? "")));
  for (const candidate of candidates) {
    if (candidate && text.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function reset(): Promise<void> {
  console.log("🧹 デモテナントのデータを削除します...");
  // cascade 削除: tenant 削除で一連の関連レコードが消える
  const { error } = await admin.from("tenants").delete().eq("id", TENANT_ID);
  if (error) throw error;
  console.log("✅ 削除完了。");
}

// ─── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--reset")) {
    await reset();
    return;
  }

  console.log("🚀 デモテナント `Ledra Motors` をセットアップします...\n");

  // 1) Tenant
  console.log("─ Tenant");
  await upsert("tenants", [TENANT], "id");
  console.log(`  ✓ ${TENANT.name} (${TENANT.slug})`);

  // 2) Customers
  console.log("─ Customers");
  const customerRows = CUSTOMERS.map((c) => ({
    id: uuid("c001", c.idn),
    tenant_id: TENANT_ID,
    name: c.name,
    name_kana: c.name_kana,
    email: c.email,
    phone: c.phone,
    postal_code: c.postal_code,
    address: c.address,
    note: c.note ?? null,
  }));
  await upsert("customers", customerRows, "id");
  console.log(`  ✓ ${customerRows.length} 件`);

  // 3) Vehicles
  console.log("─ Vehicles");
  const vehicleRows = VEHICLES.map((v) => {
    const customer = CUSTOMERS.find((c) => c.idn === v.customerIdn);
    if (!customer) throw new Error(`missing customer idn=${v.customerIdn}`);
    return {
      id: uuid("v001", v.idn),
      tenant_id: TENANT_ID,
      maker: v.maker,
      model: v.model,
      year: v.year,
      plate_display: v.plate_display,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone_masked: customer.phone.slice(-4),
      notes: v.notes ?? null,
    };
  });
  await upsert("vehicles", vehicleRows, "id");
  console.log(`  ✓ ${vehicleRows.length} 台`);

  // 4) Certificates
  console.log("─ Certificates");
  const certRows = CERTS.map((ct) => {
    const vehicle = VEHICLES.find((v) => v.idn === ct.vehicleIdn);
    if (!vehicle) throw new Error(`missing vehicle idn=${ct.vehicleIdn}`);
    const customer = CUSTOMERS.find((c) => c.idn === vehicle.customerIdn);
    if (!customer) throw new Error(`missing customer for vehicle idn=${ct.vehicleIdn}`);

    return {
      id: uuid("ce01", ct.idn),
      tenant_id: TENANT_ID,
      public_id: ct.public_id,
      vehicle_id: uuid("v001", ct.vehicleIdn),
      customer_id: uuid("c001", vehicle.customerIdn),
      status: ct.status ?? "active",
      customer_name: customer.name,
      certificate_no: ct.certificate_no,
      service_type: ct.service_type,
      vehicle_info_json: {
        maker: vehicle.maker,
        model: vehicle.model,
        year: vehicle.year,
        plate_display: vehicle.plate_display,
      },
      content_preset_json: {
        title: ct.preset_title,
        products: ct.preset_products ?? [],
      },
      content_free_text: `${vehicle.maker} ${vehicle.model} に ${ct.preset_title} を施工しました。詳細は別紙作業報告書をご確認ください。`,
      current_version: 1,
      created_at: dateDaysAgo(ct.daysAgo),
      updated_at: dateDaysAgo(ct.daysAgo),
    };
  });
  await upsert("certificates", certRows, "id");
  console.log(`  ✓ ${certRows.length} 枚（public_id: LEDRA-DEMO-0001 〜 ${String(certRows.length).padStart(4, "0")}）`);

  // 5) Certificate images (metadata only — 実ファイルはストレージにアップロード不要。
  //    HeroCard の施工記録数カウンタと、公開証明書ページのギャラリー件数を成立させるために投入。
  //    実画像を表示したい場合は、Supabase ストレージ `certificate-images` バケットの
  //    `demo/placeholder-XX.jpg` に placeholder 画像を 1 枚だけ置けば、全ての seed
  //    画像が同じ見た目で表示されるようにパスを共有している)
  console.log("─ Certificate images");
  // 既存の seed 残骸を一旦削除（storage_path UNIQUE 制約回避）
  const certIds = certRows.map((c) => c.id);
  const { error: imgDelErr } = await admin
    .from("certificate_images")
    .delete()
    .in("certificate_id", certIds);
  if (imgDelErr && !imgDelErr.message.includes("not exist")) {
    console.error("⚠️ 既存 certificate_images の掃除に失敗:", imgDelErr.message);
  }

  const imageRows = certRows.flatMap((cert, certIdx) => {
    // 1 枚の証明書につき 3〜5 枚の施工写真メタデータを作る
    const count = 3 + (certIdx % 3);
    // storage_path はテーブル側に UNIQUE 制約があるので、cert 単位でユニーク化
    return Array.from({ length: count }).map((_, i) => ({
      id: uuid("cf01", certIdx * 10 + i + 1),
      tenant_id: TENANT_ID,
      certificate_id: cert.id,
      storage_path: `demo/${cert.public_id}/${String(i + 1).padStart(2, "0")}.jpg`,
      file_name: `${cert.public_id}-${String(i + 1).padStart(2, "0")}.jpg`,
      content_type: "image/jpeg",
      file_size: 320000 + i * 12000,
      sort_order: i,
    }));
  });
  await upsert("certificate_images", imageRows, "id");
  console.log(`  ✓ ${imageRows.length} 件（※実ファイルはストレージに任意で配置）`);

  // 6) Vehicle histories (車両ページ・公開証明書ページの「履歴」セクション用)
  console.log("─ Vehicle histories");
  // こちらも念のため既存 seed 分を掃除
  const vehicleIds = vehicleRows.map((v) => v.id);
  const { error: histDelErr } = await admin
    .from("vehicle_histories")
    .delete()
    .in("vehicle_id", vehicleIds);
  if (histDelErr && !histDelErr.message.includes("not exist")) {
    console.error("⚠️ 既存 vehicle_histories の掃除に失敗:", histDelErr.message);
  }
  const historyRows: Record<string, unknown>[] = [];
  let histCounter = 0;
  for (const cert of CERTS) {
    histCounter += 1;
    historyRows.push({
      id: uuid("a501", histCounter),
      tenant_id: TENANT_ID,
      vehicle_id: uuid("v001", cert.vehicleIdn),
      certificate_id: uuid("ce01", cert.idn),
      type: "certificate_issued",
      title: `${cert.preset_title} 施工`,
      description: (cert.preset_products ?? []).join(" / ") || "施工完了",
      performed_at: dateDaysAgo(cert.daysAgo),
    });
  }
  // 車両ごとに「車両を登録」イベントを足してタイムラインの起点を作る
  // (type は src/lib/audit/certificateLog.ts の AuditEventType 仕様に合わせる)
  for (const v of VEHICLES) {
    // 最古施工の前日を登録日とみなす（複数施工されていれば全てより前の時点）
    const firstCert = CERTS.filter((c) => c.vehicleIdn === v.idn).sort((a, b) => b.daysAgo - a.daysAgo)[0];
    if (!firstCert) continue;
    histCounter += 1;
    historyRows.push({
      id: uuid("a501", histCounter),
      tenant_id: TENANT_ID,
      vehicle_id: uuid("v001", v.idn),
      type: "vehicle_registered",
      title: "車両を登録",
      description: `${v.maker} ${v.model} (${v.plate_display}) を登録`,
      performed_at: dateDaysAgo(firstCert.daysAgo + 1),
    });
  }
  await upsert("vehicle_histories", historyRows, "id", { typeColumn: "type" });
  console.log(`  ✓ 投入完了（不許可の type は自動スキップ済み）`);

  // 7) Report
  console.log("\n🎉 セットアップ完了\n");
  console.log("  Tenant ID :", TENANT_ID);
  console.log("  Tenant slug:", TENANT_SLUG);
  console.log("  Customers :", customerRows.length);
  console.log("  Vehicles  :", vehicleRows.length);
  console.log("  Certificates:", certRows.length);
  console.log("  Images    :", imageRows.length);
  console.log("  Histories :", historyRows.length);
  console.log("\n  公開証明書の例:");
  CERTS.slice(0, 3).forEach((c) => {
    console.log(`    https://app.ledra.co.jp/c/${c.public_id}`);
  });
  console.log("\n  リセット: npx tsx scripts/setup-demo-tenant.ts --reset");
}

main().catch((err) => {
  console.error("\n❌ エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
