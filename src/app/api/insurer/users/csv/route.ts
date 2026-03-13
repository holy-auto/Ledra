import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient as createSupabaseAnon } from "@supabase/supabase-js";
// 既存の「セッション(cookie)で動く」サーバークライアントを使う（あなたの他APIが動いてる前提）
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";

export const runtime = "nodejs";

type CsvRow = {
  email: string;
  role: "admin" | "viewer" | "auditor";
  display_name: string | null;
};

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseAdmin(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// PowerShell/curl での確認用に Authorization: Bearer も受けられるようにする
function getAnonSupabaseWithBearer(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authz = req.headers.get("authorization") || "";
  return createSupabaseAnon(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authz ? { headers: { Authorization: authz } } : undefined,
  });
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function parseCsv(text: string): CsvRow[] {
  // 期待：email,role,display_name（ヘッダあり/なし両対応）
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitLine = (l: string) => {
    // 超簡易CSV（カンマ区切り、ダブルクォートのエスケープは最小対応）
    // "a,b",c のようなケースはここでは使わない前提（必要なら後で強化）
    return l.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
  };

  let start = 0;
  const head = splitLine(lines[0]).map((x) => x.toLowerCase());
  if (head[0] === "email" && head[1] === "role") start = 1;

  const out: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const email = normalizeEmail(cols[0] || "");
    const role = (cols[1] || "").toLowerCase() as any;
    const display = (cols[2] || "").trim();
    if (!email) throw new Error(`CSV parse error: empty email at line ${i + 1}`);
    if (!["admin", "viewer", "auditor"].includes(role)) {
      throw new Error(`CSV parse error: invalid role "${cols[1] || ""}" at line ${i + 1}`);
    }
    out.push({
      email,
      role,
      display_name: display ? display : null,
    });
  }
  return out;
}

import { enforceBilling } from "@/lib/billing/guard";

export async function POST(req: Request) {
  const deny = await enforceBilling(req, { minPlan: "pro", action: "insurer_users_csv" });
  if (deny) return deny as any;
  // dev用の認証スキップは完全削除（本番仕様）
  if (req.headers.get("x-dev-skip-auth")) {
    return NextResponse.json({ error: "x-dev-skip-auth is not allowed" }, { status: 403 });
  }

  // 1) 認証：cookieセッション（通常） or Authorization Bearer（PowerShell検証用）
  //    cookie側は既存の server client（他APIで動作済みの前提）
  const serverSb = await createSupabaseServer();
  const { data: u1 } = await serverSb.auth.getUser();

  let user = u1?.user ?? null;
  if (!user) {
    // bearer を試す
    const anonSb = getAnonSupabaseWithBearer(req);
    const { data: u2 } = await anonSb.auth.getUser();
    user = u2?.user ?? null;
  }

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) admin権限チェック（RLS再帰回避済みの security definer 関数）
  //    cookieで通ってるなら serverSb、bearerなら anonSb を使うのが理想だが、
  //    ここは serverSb で失敗した場合に bearer client でもチェックする。
  let isAdmin = false;

  {
    const { data, error } = await serverSb.rpc("is_insurer_admin");
    if (!error && data === true) isAdmin = true;
  }

  if (!isAdmin) {
    const anonSb = getAnonSupabaseWithBearer(req);
    const { data, error } = await anonSb.rpc("is_insurer_admin");
    if (!error && data === true) isAdmin = true;
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "forbidden (admin only)" }, { status: 403 });
  }

  // 3) 対象 insurer_id を特定（adminが所属する insurer を1つ取る）
  //    ここは service role で取得してOK（すでに admin 判定済み）
  const adminSb = getAdminSupabase();

  const { data: adminRow, error: adminRowErr } = await adminSb
    .from("insurer_users")
    .select("insurer_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (adminRowErr || !adminRow?.insurer_id) {
    return NextResponse.json({ error: "cannot resolve insurer_id for admin" }, { status: 500 });
  }

  const insurerId = adminRow.insurer_id as string;

  // 4) CSV読み込み（text/csv or plain text）
  const body = await req.text();
  let rows: CsvRow[];
  try {
    rows = parseCsv(body);
  } catch (e: any) {
    return NextResponse.json({ error: "invalid csv", detail: e?.message || String(e) }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, created_auth: 0, existing_auth: 0, errors: [] });
  }

  // 5) 行ごとに、Authユーザーが無ければ作成 → insurer_users upsert
  //    ※upsert関数は「Authが必ず存在する」前提なので、先に作る
  let createdAuth = 0;
  let existingAuth = 0;
  let upserted = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const r of rows) {
    try {
      const email = r.email;

      // Authユーザー作成（存在確認APIが無い版のSDKなので、作成を試して既存ならスキップ）
      const cr = await adminSb.auth.admin.createUser({
        email,
        email_confirm: true,
      });

      if ((cr as any)?.error) {
        const msg = String((cr as any).error?.message ?? (cr as any).error ?? "");
        // 既存ユーザーの場合は「既存扱い」にする（文言揺れを広めに拾う）
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("duplicate")) {
          existingAuth++;
        } else {
          throw new Error(`createUser failed: ${msg || "unknown"}`);
        }
      } else {
        createdAuth++;
      }

      const { error: upErr } = await adminSb.rpc("upsert_insurer_user", {
        p_insurer_id: insurerId,
        p_email: email,
        p_role: r.role,
        p_display_name: r.display_name,
      });

      if (upErr) throw new Error(`upsert_insurer_user failed: ${upErr.message}`);
      upserted++;
    } catch (e: any) {
      errors.push({ email: r.email, error: e?.message || String(e) });
    }
  }

  // 6) 監査ログ（actionは最終形に合わせて export_csv を使う：meta に import_users を入れる）
  try {
    await logInsurerAccess({
      action: "export_csv",
      certificateId: "import_users",
      meta: {
        insurer_id: insurerId,
        actor_user_id: user.id,
        op: "import_users",
        total_rows: rows.length,
        upserted,
        created_auth: createdAuth,
        existing_auth: existingAuth,
        error_count: errors.length,
      },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: req.headers.get("user-agent") || null,
    });} catch (e: any) {
  }

  return NextResponse.json({
    ok: errors.length === 0,
    insurer_id: insurerId,
    total: rows.length,
    upserted,
    created_auth: createdAuth,
    existing_auth: existingAuth,
    errors,
  });
}




