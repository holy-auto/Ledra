$ErrorActionPreference = "Stop"

# 1) audit.ts を作成
$auditPath = "holy-cert/src/lib/insurer/audit.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $auditPath) | Out-Null

@"
import { createClient } from `"@/lib/supabase/server`";
import { supabaseAdmin } from `"@/lib/supabase/admin`";

export type AuditAction = `"view`" | `"search`" | `"download_pdf`" | `"export_csv`";

export async function logInsurerAccess(params: {
  action: AuditAction;
  certificateId: string;
  meta?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const { action, certificateId, meta, ip, userAgent } = params;

  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error(`"Not authenticated`");

  const { data: me, error: meErr } = await sb
    .from(`"insurer_users`")
    .select(`"id, insurer_id`")
    .eq(`"user_id`", data.user.id)
    .eq(`"is_active`", true)
    .maybeSingle();

  if (meErr) throw meErr;
  if (!me) throw new Error(`"Insurer user not found`");

  const { error: insErr } = await supabaseAdmin.from(`"insurer_access_logs`").insert({
    insurer_id: me.insurer_id,
    insurer_user_id: me.id,
    certificate_id: certificateId,
    action,
    meta: meta ?? {},
    ip: ip ?? null,
    user_agent: userAgent ?? null,
  });

  if (insErr) throw insErr;
}
"@ | Set-Content -Encoding UTF8 $auditPath

Write-Host "✅ Created: $auditPath"

# 2) route.ts の supabaseServer → createClient を置換
$targets = @(
  "holy-cert/src/app/api/insurer/certificate/[id]/route.ts",
  "holy-cert/src/app/api/insurer/users/csv/route.ts"
)

foreach ($p in $targets) {
  if (-not (Test-Path $p)) {
    Write-Host "⚠️ Not found (skip): $p"
    continue
  }
  $c = Get-Content -Raw $p

  # import 差し替え
  $c = $c -replace 'import\s+\{\s*supabaseServer\s*\}\s+from\s+"@/lib/supabase/server";', 'import { createClient } from "@/lib/supabase/server";'
  $c = $c -replace "import\s+\{\s*supabaseServer\s*\}\s+from\s+'@/lib/supabase/server';", "import { createClient } from '@/lib/supabase/server';"

  # 変数生成の置換（supabaseServer() → await createClient()）
  $c = $c -replace 'const\s+sb\s*=\s*supabaseServer\(\)\s*;', 'const sb = await createClient();'

  # もし別名で使ってた場合に備えて、関数呼び出しだけ置換
  $c = $c -replace 'supabaseServer\(\)', 'await createClient()'

  Set-Content -Encoding UTF8 $p $c
  Write-Host "✅ Patched: $p"
}

Write-Host "✅ Done patching files."
