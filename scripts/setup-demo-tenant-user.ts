/**
 * setup-demo-tenant-user.ts
 *
 * デモ施工店テナント "Ledra Motors" にログインできる管理者ユーザーを
 * Supabase Auth に作成し、tenant_memberships で紐付けます。
 *
 * 前提:
 *   - `scripts/setup-demo-tenant.ts` を先に実行してテナントを作成済みであること
 *   - SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が env に設定されていること
 *
 * 実行:
 *   npx tsx --env-file=.env.local scripts/setup-demo-tenant-user.ts
 *
 * 冪等性:
 *   - 既存のユーザーがあれば再利用（メールアドレスで同定）
 *   - tenant_memberships は upsert
 *   - 再実行しても重複レコードは作られない
 *
 * デモログイン情報（ここで作成されるアカウント）:
 *   Email   : demo@ledra-motors.example
 *   Password: Demo1234!
 *   Role    : owner (管理者権限最大)
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

// 同じ値が setup-demo-tenant.ts にも定義されていることに注意
const TENANT_ID = "00000000-0000-0000-0000-de0000000010";
const TENANT_SLUG = "ledra-motors-demo";

const DEMO_EMAIL = "demo@ledra-motors.example";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_DISPLAY_NAME = "Ledra Motors オーナー";
const DEMO_ROLE = "owner";

async function ensureTenantExists(): Promise<void> {
  const { data, error } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", TENANT_ID)
    .maybeSingle();

  if (error) {
    console.error("❌ tenants テーブルの確認に失敗しました:", error.message);
    process.exit(1);
  }
  if (!data) {
    console.error(
      "❌ デモテナントが存在しません。先に以下を実行してください:",
      "\n   npx tsx --env-file=.env.local scripts/setup-demo-tenant.ts",
    );
    process.exit(1);
  }
  console.log(`✅ テナント確認: ${data.name}`);
}

async function findOrCreateAuthUser(): Promise<string> {
  // listUsers でページング（1000ユーザーを超える環境では追加考慮が必要）
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    console.error("❌ Auth ユーザー一覧取得に失敗しました:", listErr.message);
    process.exit(1);
  }

  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
  if (existing) {
    console.log(`✅ 既存の Auth ユーザーを再利用: ${DEMO_EMAIL} (${existing.id})`);
    return existing.id;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: DEMO_DISPLAY_NAME, source: "demo-tenant" },
  });
  if (createErr || !created?.user) {
    console.error("❌ Auth ユーザーの作成に失敗しました:", createErr?.message ?? "unknown");
    process.exit(1);
  }
  console.log(`✅ Auth ユーザー作成: ${DEMO_EMAIL} (${created.user.id})`);
  return created.user.id;
}

/**
 * tenant_memberships への upsert。
 * 事前の setup-demo-tenant.ts と同じ schema-tolerance 処理で、知らないカラムは
 * 自動スキップしつつリトライする。
 */
async function upsertMembership(userId: string): Promise<void> {
  let payload: Record<string, unknown> = {
    tenant_id: TENANT_ID,
    user_id: userId,
    role: DEMO_ROLE,
  };
  const dropped = new Set<string>();

  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await admin
      .from("tenant_memberships")
      .upsert(payload, { onConflict: "tenant_id,user_id" });

    if (!error) {
      if (dropped.size > 0) {
        console.log(`  ℹ️ schema に無いカラムをスキップ: ${[...dropped].join(", ")}`);
      }
      return;
    }

    const missingColumn = error.message.match(/Could not find the '([^']+)' column/);
    if (missingColumn && !dropped.has(missingColumn[1])) {
      const col = missingColumn[1];
      dropped.add(col);
      payload = { ...payload };
      delete (payload as Record<string, unknown>)[col];
      continue;
    }

    console.error("❌ tenant_memberships upsert 失敗:", error.message);
    process.exit(1);
  }
  console.error("❌ tenant_memberships: schema 不一致が多すぎます");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("🚀 デモ施工店ユーザーをセットアップします...\n");

  await ensureTenantExists();
  const userId = await findOrCreateAuthUser();
  await upsertMembership(userId);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  デモ施工店ユーザー セットアップ完了 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ログイン URL : /login
  メール        : ${DEMO_EMAIL}
  パスワード    : ${DEMO_PASSWORD}

  テナント      : Ledra Motors（デモ）
  tenant_slug   : ${TENANT_SLUG}
  ロール        : ${DEMO_ROLE}

  ログイン後に見られるもの:
    /admin                    ダッシュボード（KPI・30日推移チャート）
    /admin/certificates       証明書一覧（LEDRA-DEMO-0001〜0016）
    /admin/vehicles           車両一覧（10台、各車両のサービス履歴タイムライン）
    /admin/customers          顧客一覧（8名、360°ビュー）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error("\n❌ 予期しないエラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
