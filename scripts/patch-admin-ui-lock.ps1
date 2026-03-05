$ErrorActionPreference = "Stop"

Set-Location C:\Users\admin\holy-cert
$root = (Get-Location).Path
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $root ("_backup\admin_ui_lock_" + $ts)
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function WriteUtf8([string]$p, [string]$t) {
  $enc = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($p, $t, $enc)
}

function BackupFile([string]$rel) {
  $src = Join-Path $root $rel
  if (!(Test-Path $src)) { throw "NOT FOUND: $rel" }
  $dst = Join-Path $backupDir ($rel -replace "[\\/:*?""<>|]", "_")
  Copy-Item -Force $src $dst
}

function EnsureImport([string]$content, [string]$importLine) {
  if ($content -match [regex]::Escape($importLine)) { return $content }
  # export default の直前に差し込む
  $re = [regex]'(\r?\n)(export default\s+async\s+function\s+Page)'
  if ($re.IsMatch($content)) {
    return $re.Replace($content, "`r`n$importLine`r`n`r`n`$2", 1)
  }
  throw "Could not insert import; export default Page not found."
}

function WrapDefaultPageReturn([string]$content, [string]$featureKey) {
  if ($content -match "<AdminFeatureGuard\b") { return $content } # 二重ラップ防止

  $mPage = [regex]::Match($content, 'export default\s+async\s+function\s+Page\b', 'Singleline')
  if (!$mPage.Success) { throw "export default async function Page not found." }

  $mRet = [regex]::Match($content, 'return\s*\(', 'Singleline', $mPage.Index)
  if (!$mRet.Success) { throw "return( not found in Page." }

  $openParenIndex = $mRet.Index + ($mRet.Value.Length - 1)  # '(' の位置

  # ')' マッチング（文字列中は無視）
  $depth = 1
  $inS = $false; $inD = $false; $inT = $false
  $esc = $false
  $closeIndex = -1

  for ($i = $openParenIndex + 1; $i -lt $content.Length; $i++) {
    $ch = $content[$i]

    if ($esc) { $esc = $false; continue }

    if ($inS) {
      if ($ch -eq "\") { $esc = $true; continue }
      if ($ch -eq [char]39) { $inS = $false; continue }
      continue
    }
    if ($inD) {
      if ($ch -eq "\") { $esc = $true; continue }
      if ($ch -eq [char]34) { $inD = $false; continue }
      continue
    }
    if ($inT) {
      if ($ch -eq "\") { $esc = $true; continue }
      if ($ch -eq "`") { $inT = $false; continue }
      continue
    }

    if ($ch -eq [char]39) { $inS = $true; continue }
    if ($ch -eq [char]34) { $inD = $true; continue }
    if ($ch -eq "`") { $inT = $true; continue }

    if ($ch -eq "(") { $depth++; continue }
    if ($ch -eq ")") {
      $depth--
      if ($depth -eq 0) { $closeIndex = $i; break }
      continue
    }
  }

  if ($closeIndex -lt 0) { throw "Could not find matching ')' for return( ... )." }

  $before = $content.Substring(0, $openParenIndex + 1)
  $inside = $content.Substring($openParenIndex + 1, $closeIndex - ($openParenIndex + 1))
  $after  = $content.Substring($closeIndex)

  $wrapOpen  = "`r`n  <AdminFeatureGuard feature=`"$featureKey`">`r`n"
  $wrapClose = "`r`n  </AdminFeatureGuard>`r`n"

  return $before + $wrapOpen + $inside + $wrapClose + $after
}

# 対象
$planFeatures = "src\lib\billing\planFeatures.ts"
$templatesPage = "src\app\admin\templates\page.tsx"
$logoPage = "src\app\admin\logo\page.tsx"
$certPage = "src\app\admin\certificates\page.tsx"
$certClient = "src\app\admin\certificates\CertificatesTableClient.tsx"
$guardFile = "src\app\admin\AdminFeatureGuard.tsx"

# backup
@($planFeatures,$templatesPage,$logoPage,$certPage,$certClient) | ForEach-Object { BackupFile $_ }

# 1) planFeatures.ts 拡張
$pfPath = Join-Path $root $planFeatures
$pf = Get-Content -Raw -Path $pfPath

if ($pf -notmatch '"issue_certificate"' ) {
  # FeatureKey union に追加（export_selected_csv 行の直後に差し込む）
  $pf = [regex]::Replace(
    $pf,
    '\|\s*"export_selected_csv"\s*\r?\n',
    '| "export_selected_csv"' + "`r`n" +
    '  | "issue_certificate"' + "`r`n" +
    '  | "pdf_one"' + "`r`n" +
    '  | "pdf_zip"' + "`r`n" +
    '  | "manage_templates"' + "`r`n" +
    '  | "upload_logo"' + "`r`n",
    1
  )

  if ($pf -notmatch '"issue_certificate"' ) { throw "Failed to patch FeatureKey union in planFeatures.ts" }

  # mini
  if ($pf -match 'mini:\s*\{\s*[\s\S]*?export_selected_csv:\s*false,' -and $pf -notmatch 'mini:\s*\{[\s\S]*?issue_certificate') {
    $pf = [regex]::Replace(
      $pf,
      '(mini:\s*\{[\s\S]*?export_selected_csv:\s*false,\s*)',
      '$1' +
      "    issue_certificate: true,`r`n" +
      "    pdf_one: true,`r`n" +
      "    pdf_zip: false,`r`n" +
      "    manage_templates: false,`r`n" +
      "    upload_logo: false,`r`n",
      1
    )
  }

  # standard
  if ($pf -match 'standard:\s*\{\s*[\s\S]*?export_selected_csv:\s*false,' -and $pf -notmatch 'standard:\s*\{[\s\S]*?issue_certificate') {
    $pf = [regex]::Replace(
      $pf,
      '(standard:\s*\{[\s\S]*?export_selected_csv:\s*false,\s*)',
      '$1' +
      "    issue_certificate: true,`r`n" +
      "    pdf_one: true,`r`n" +
      "    pdf_zip: true,`r`n" +
      "    manage_templates: true,`r`n" +
      "    upload_logo: true,`r`n",
      1
    )
  }

  # pro
  if ($pf -match 'pro:\s*\{\s*[\s\S]*?export_selected_csv:\s*true,' -and $pf -notmatch 'pro:\s*\{[\s\S]*?issue_certificate') {
    $pf = [regex]::Replace(
      $pf,
      '(pro:\s*\{[\s\S]*?export_selected_csv:\s*true,\s*)',
      '$1' +
      "    issue_certificate: true,`r`n" +
      "    pdf_one: true,`r`n" +
      "    pdf_zip: true,`r`n" +
      "    manage_templates: true,`r`n" +
      "    upload_logo: true,`r`n",
      1
    )
  }
}

WriteUtf8 $pfPath $pf

# 2) AdminFeatureGuard 追加（新規）
$guardPath = Join-Path $root $guardFile
if (!(Test-Path $guardPath)) {
  $guardDir = Split-Path -Parent $guardPath
  New-Item -ItemType Directory -Force -Path $guardDir | Out-Null

  $guard = @'
"use client";

import Link from "next/link";
import { ReactNode, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature, normalizePlanTier, type FeatureKey } from "@/lib/billing/planFeatures";

export default function AdminFeatureGuard({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const bs = useAdminBillingStatus();
  const pathname = usePathname();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const qs = sp?.toString();
    return pathname + (qs ? \`?\${qs}\` : "");
  }, [pathname, sp]);

  const isActive = bs.data?.is_active ?? true;
  const planTier = normalizePlanTier(bs.data?.plan_tier ?? "pro");
  const allowed = isActive && canUseFeature(planTier, feature);

  if (allowed) return <>{children}</>;

  const title = !isActive
    ? "支払いが停止中のため、この画面の操作は無効です。"
    : \`現在のプラン（\${planTier}）ではこの機能は利用できません。\`;

  const cta = !isActive ? "支払いを再開" : "プランをアップグレード";

  return (
    <div className="space-y-3">
      <div className="rounded border bg-yellow-50 p-3 text-sm">
        <div className="font-semibold">{title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link className="rounded border bg-white px-3 py-2" href={\`/admin/billing?next=\``${encodeURIComponent(nextUrl)}\`}>
            {cta}（/admin/billing）
          </Link>
          <span className="text-xs opacity-70">plan: {planTier} / active: {String(isActive)}</span>
        </div>
      </div>

      <div className="opacity-60 pointer-events-none select-none" aria-disabled="true">
        {children}
      </div>
    </div>
  );
}
'@
  WriteUtf8 $guardPath $guard
}

# 3) templates/logo を Guard でラップ
function PatchPage([string]$rel, [string]$feature) {
  $p = Join-Path $root $rel
  $c = Get-Content -Raw -Path $p

  $c = EnsureImport $c 'import AdminFeatureGuard from "@/app/admin/AdminFeatureGuard";'
  $c = WrapDefaultPageReturn $c $feature

  WriteUtf8 $p $c
}

PatchPage $templatesPage "manage_templates"
PatchPage $logoPage "upload_logo"

# 4) certificates: PDF / issue を planFeatures に寄せる（あれば上書き）
$cpPath = Join-Path $root $certPage
$cp = Get-Content -Raw -Path $cpPath
if ($cp -match 'const\s+canIssue\s*=' -and $cp -notmatch '"issue_certificate"') {
  $cp = [regex]::Replace($cp, 'const\s+canIssue\s*=\s*.*?;', 'const canIssue = isActive && canUseFeature(planTier, "issue_certificate");', 1)
  WriteUtf8 $cpPath $cp
}

$ccPath = Join-Path $root $certClient
$cc = Get-Content -Raw -Path $ccPath
if ($cc -match 'const\s+canPdfZip\s*=' -and $cc -notmatch '"pdf_zip"') {
  $cc = [regex]::Replace($cc, 'const\s+canPdfZip\s*=\s*.*?;', 'const canPdfZip = isActive && canUseFeature(planTier, "pdf_zip");', 1)
}
if ($cc -match 'const\s+canPdfOne\s*=' -and $cc -notmatch '"pdf_one"') {
  $cc = [regex]::Replace($cc, 'const\s+canPdfOne\s*=\s*.*?;', 'const canPdfOne = isActive && canUseFeature(planTier, "pdf_one");', 1)
}
WriteUtf8 $ccPath $cc

"OK: patched. backup=" + $backupDir



