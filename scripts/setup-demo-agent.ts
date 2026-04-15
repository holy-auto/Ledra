/**
 * setup-demo-agent.ts
 *
 * デモ用代理店アカウントをセットアップするスクリプト。
 * Supabase Auth にデモユーザーを作成し、agent_users テーブルにリンクします。
 *
 * 前提条件:
 *   - supabase/migrations/20260409000001_demo_seed_agent.sql が適用済みであること
 *   - .env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定されていること
 *
 * 実行方法:
 *   npx tsx scripts/setup-demo-agent.ts
 *
 * 作成されるデモアカウント:
 *   メール:    demo@agent.ledra.test
 *   パスワード: Demo1234!
 *   ロール:    admin (代理店ポータル管理者)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const DEMO_AGENT_ID = "00000000-0000-0000-0000-de0000000001";
const DEMO_EMAIL = "demo@agent.ledra.test";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_DISPLAY_NAME = "デモ 太郎";

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
  console.log("🚀 デモ代理店アカウントのセットアップを開始します...\n");

  // ── 1) Check that demo agent record exists ────────────────────────
  const { data: agent, error: agentErr } = await admin
    .from("agents")
    .select("id, name")
    .eq("id", DEMO_AGENT_ID)
    .single();

  if (agentErr || !agent) {
    console.error(
      "❌ デモ代理店レコードが見つかりません。",
      "\n   先に以下のマイグレーションを適用してください:",
      "\n   supabase/migrations/20260409000001_demo_seed_agent.sql",
    );
    process.exit(1);
  }
  console.log(`✅ デモ代理店確認: ${agent.name} (${DEMO_AGENT_ID})`);

  // ── 2) Create or fetch Supabase Auth user ─────────────────────────
  let userId: string;

  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users?.find((u) => u.email === DEMO_EMAIL);

  if (existingUser) {
    userId = existingUser.id;
    console.log(`✅ 既存デモユーザー確認: ${DEMO_EMAIL} (${userId})`);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DEMO_DISPLAY_NAME },
    });

    if (createErr || !created?.user) {
      console.error("❌ ユーザー作成に失敗しました:", createErr?.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log(`✅ デモユーザー作成: ${DEMO_EMAIL} (${userId})`);
  }

  // ── 3) Link user to demo agent ────────────────────────────────────
  const { error: linkErr } = await admin
    .from("agent_users")
    .upsert(
      {
        agent_id: DEMO_AGENT_ID,
        user_id: userId,
        role: "admin",
        display_name: DEMO_DISPLAY_NAME,
        is_active: true,
      },
      { onConflict: "agent_id,user_id" },
    );

  if (linkErr) {
    console.error("❌ agent_users リンクに失敗しました:", linkErr.message);
    process.exit(1);
  }
  console.log(`✅ agent_users リンク完了 (role: admin)`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  デモアカウント セットアップ完了 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL      : /agent/login
  メール    : ${DEMO_EMAIL}
  パスワード : ${DEMO_PASSWORD}

  代理店名  : デモ代理店株式会社
  ロール    : admin

  確認できる機能:
    /agent/materials  — 営業資料 (8件)
    /agent/contracts  — 契約書 (3件: 署名完了・送信済・閲覧済)
    /agent/shared-files — 共有ファイル
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((e) => {
  console.error("❌ 予期しないエラー:", e);
  process.exit(1);
});
