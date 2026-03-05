$ErrorActionPreference = "Stop"
Set-Location C:\Users\admin\holy-cert
$root = (Get-Location).Path

$rel = "src\app\admin\layout.tsx"
$abs = Join-Path $root $rel
if (!(Test-Path $abs)) { throw "NOT FOUND: $abs" }

# backup
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$bkDir = Join-Path $root ("_backup\wrap_adminrouteguard_suspense_" + $ts)
New-Item -ItemType Directory -Force $bkDir | Out-Null
Copy-Item -Force $abs (Join-Path $bkDir "layout.tsx.before")

function WriteUtf8([string]$p, [string]$t) {
  $enc = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($p, $t, $enc)
}

$c = Get-Content -Raw -Path $abs

# 1) Suspense import を追加（なければ）
if ($c -notmatch '\bSuspense\b') {
  # 既存の react import があればそこに混ぜる
  $re = [regex]'import\s+\{\s*([^\}]+)\s*\}\s+from\s+"react";'
  if ($re.IsMatch($c)) {
    $m = $re.Match($c)
    $inside = $m.Groups[1].Value
    if ($inside -notmatch '\bSuspense\b') {
      $newInside = "Suspense, " + $inside.Trim()
      $c = $re.Replace($c, 'import { ' + $newInside + ' } from "react";', 1)
    }
  } else {
    # react import が無いなら先頭に追加
    $c = 'import { Suspense } from "react";' + "`r`n" + $c
  }
}

# 2) AdminRouteGuard を Suspense で包む（既に包まれてたら何もしない）
if ($c -notmatch '<Suspense\b[^>]*>\s*<AdminRouteGuard') {
  if ($c -match '<AdminRouteGuard>\s*\{children\}\s*</AdminRouteGuard>') {
    $c = [regex]::Replace(
      $c,
      '<AdminRouteGuard>\s*\{children\}\s*</AdminRouteGuard>',
      '<Suspense fallback={null}><AdminRouteGuard>{children}</AdminRouteGuard></Suspense>',
      1
    )
  } elseif ($c -match '\{children\}') {
    # フォールバック：children が裸なら包む
    $c = [regex]::Replace(
      $c,
      '\{children\}',
      '<Suspense fallback={null}><AdminRouteGuard>{children}</AdminRouteGuard></Suspense>',
      1
    )
  } else {
    throw "Could not find {children} in admin layout"
  }
}

WriteUtf8 $abs $c
"OK: wrapped AdminRouteGuard in Suspense. backup=" + $bkDir
