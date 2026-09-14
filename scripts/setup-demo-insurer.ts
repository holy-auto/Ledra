/**
 * setup-demo-insurer.ts
 *
 * デモ用保険会社アカウントをセットアップするスクリプト。
 * Supabase Auth にデモユーザー（admin / viewer / auditor）を作成し、
 * insurer_users テーブルにリンクします。
 *
 * 前提条件:
 *   - supabase/migrations/20260502000001_demo_seed_insurer.sql が適用済みであること
 *   - .env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定されていること
 *
 * 実行方法:
 *   npx tsx scripts/setup-demo-insurer.ts
 *
 * 作成されるデモアカウント:
 *   admin   : demo@insurer.ledra.test     / Demo1234!
 *   viewer  : viewer@insurer.ledra.test   / Demo1234!
 *   auditor : auditor@insurer.ledra.test  / Demo1234!
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const DEMO_INSURER_ID = "00000000-0000-0000-0000-de0000000100";
// setup-demo-tenant.ts が作るデモ施工店。これを見せないと、デモ保険会社は
// ログインできても検索結果が常に0件になる（アクセスできるテナントが1つも無いため）。
const DEMO_TENANT_ID = "00000000-0000-0000-0000-de0000000010";
const DEMO_PASSWORD = "Demo1234!";

type DemoUser = {
  email: string;
  displayName: string;
  role: "admin" | "viewer" | "auditor";
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "demo@insurer.ledra.test",
    displayName: "保険 花子",
    role: "admin",
  },
  {
    email: "viewer@insurer.ledra.test",
    displayName: "閲覧 次郎",
    role: "viewer",
  },
  {
    email: "auditor@insurer.ledra.test",
    displayName: "監査 三郎",
    role: "auditor",
  },
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください。",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("🚀 デモ保険会社アカウントのセットアップを開始します...\n");

  // ── 1) Check that demo insurer record exists ──────────────────────
  const { data: insurer, error: insurerErr } = await admin
    .from("insurers")
    .select("id, name, plan_tier")
    .eq("id", DEMO_INSURER_ID)
    .single();

  if (insurerErr || !insurer) {
    console.error(
      "❌ デモ保険会社レコードが見つかりません。",
      "\n   先に以下のマイグレーションを適用してください:",
      "\n   supabase/migrations/20260502000001_demo_seed_insurer.sql",
    );
    process.exit(1);
  }
  console.log(`✅ デモ保険会社確認: ${insurer.name} (${DEMO_INSURER_ID}) [${insurer.plan_tier}]`);

  // ── 2) Fetch existing auth users once ────────────────────────────
  const { data: existing, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error("❌ 既存ユーザー一覧の取得に失敗しました:", listErr.message);
    process.exit(1);
  }

  // ── 3) Create / link each demo user ──────────────────────────────
  for (const u of DEMO_USERS) {
    let userId: string;
    const found = existing?.users?.find((x) => x.email === u.email);

    if (found) {
      userId = found.id;
      console.log(`✅ 既存ユーザー確認: ${u.email} (${userId})`);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });

      if (createErr || !created?.user) {
        console.error(`❌ ユーザー作成失敗 (${u.email}):`, createErr?.message);
        process.exit(1);
      }
      userId = created.user.id;
      console.log(`✅ ユーザー作成: ${u.email} (${userId})`);
    }

    const { error: linkErr } = await admin
      .from("insurer_users")
      .upsert(
        {
          insurer_id: DEMO_INSURER_ID,
          user_id: userId,
          role: u.role,
          display_name: u.displayName,
          is_active: true,
        },
        { onConflict: "insurer_id,user_id" },
      );

    if (linkErr) {
      console.error(`❌ insurer_users リンク失敗 (${u.email}):`, linkErr.message);
      process.exit(1);
    }
    console.log(`   → insurer_users リンク完了 (role: ${u.role})`);
  }

  // ── デモ施工店への閲覧許可 ────────────────────────────────────────
  // これが無いと insurer_accessible_tenant_ids() が空を返し、証明書検索・
  // 車両検索・店舗検索がすべて「該当なし」になる（画面は出るが常に0件）。
  const { error: accessErr } = await admin
    .from("insurer_tenant_access")
    .upsert(
      {
        insurer_id: DEMO_INSURER_ID,
        tenant_id: DEMO_TENANT_ID,
        is_active: true,
        is_enabled: true,
        revoked_at: null,
        notes: "デモ保険会社にデモ施工店を閲覧させる（デモ環境の初期データ）",
      },
      { onConflict: "insurer_id,tenant_id" },
    );

  if (accessErr) {
    console.error("❌ insurer_tenant_access 付与失敗:", accessErr.message);
    process.exit(1);
  }
  console.log("✅ デモ施工店への閲覧許可を付与");

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  デモ保険会社アカウント セットアップ完了 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL          : /insurer/login
  保険会社名    : デモ損害保険株式会社
  プラン        : pro

  アカウント:
    admin   : demo@insurer.ledra.test     / ${DEMO_PASSWORD}
    viewer  : viewer@insurer.ledra.test   / ${DEMO_PASSWORD}
    auditor : auditor@insurer.ledra.test  / ${DEMO_PASSWORD}

  確認できる機能:
    /insurer/search       — 証明書クロステナント検索
    /insurer/saved        — 保存済み検索 (3件)
    /insurer/users        — メンバー管理 (admin のみ)
    CSV / PDF エクスポート  — Pro プラン機能
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((e) => {
  console.error("❌ 予期しないエラー:", e);
  process.exit(1);
});
