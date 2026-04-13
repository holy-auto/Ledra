# LedraAnchor Amoy Testnet デプロイスクリプト
#
# 使い方:
#   1. MetaMask に Polygon Amoy ネットワークを追加
#   2. https://faucet.polygon.technology/ で無料の test POL を取得
#   3. MetaMask から秘密鍵をエクスポート
#   4. 以下のコマンドで実行:
#        .\scripts\deploy-amoy.ps1 -PrivateKey "0x..."
#
# 必要なもの:
#   - Foundry がインストール済み (foundryup を実行済み)
#   - test POL が少額（0.01 POL もあれば十分）

param(
  [Parameter(Mandatory=$true)]
  [string]$PrivateKey,
  [string]$RpcUrl = "https://rpc-amoy.polygon.technology"
)

$ErrorActionPreference = "Stop"

# Foundry チェック
if (-not (Get-Command forge -ErrorAction SilentlyContinue)) {
  Write-Host "Foundry がインストールされていません。次を実行してください:" -ForegroundColor Red
  Write-Host '  irm https://foundry.paradigm.xyz | iex' -ForegroundColor Yellow
  Write-Host '  foundryup' -ForegroundColor Yellow
  exit 1
}

# contracts ディレクトリへ移動
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repoRoot "contracts")

Write-Host "=== LedraAnchor を Polygon Amoy にデプロイします ===" -ForegroundColor Cyan
Write-Host "RPC: $RpcUrl"
Write-Host ""

# デプロイ実行
$output = forge create LedraAnchor.sol:LedraAnchor `
  --rpc-url $RpcUrl `
  --private-key $PrivateKey `
  --broadcast 2>&1 | Out-String

Write-Host $output

if ($LASTEXITCODE -ne 0) {
  Write-Host "デプロイに失敗しました。" -ForegroundColor Red
  Write-Host "よくある原因:" -ForegroundColor Yellow
  Write-Host "  - ガス代不足: https://faucet.polygon.technology/ で test POL を取得してください"
  Write-Host "  - 秘密鍵の形式: 0x で始まる 66 文字のhex文字列"
  exit 1
}

# アドレス抽出
$addressMatch = [regex]::Match($output, "Deployed to:\s+(0x[a-fA-F0-9]{40})")
if ($addressMatch.Success) {
  $contractAddress = $addressMatch.Groups[1].Value

  Write-Host ""
  Write-Host "=== デプロイ成功 ===" -ForegroundColor Green
  Write-Host "コントラクトアドレス: $contractAddress" -ForegroundColor Green
  Write-Host ""
  Write-Host "次に、以下の環境変数を .env.local または Vercel に設定してください:"
  Write-Host ""
  Write-Host "  POLYGON_ANCHOR_ENABLED=true" -ForegroundColor Cyan
  Write-Host "  POLYGON_NETWORK=amoy" -ForegroundColor Cyan
  Write-Host "  POLYGON_PRIVATE_KEY=$PrivateKey" -ForegroundColor Cyan
  Write-Host "  POLYGON_CONTRACT_ADDRESS=$contractAddress" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Polygonscan (Amoy) で確認: https://amoy.polygonscan.com/address/$contractAddress" -ForegroundColor Yellow
} else {
  Write-Host "コントラクトアドレスの抽出に失敗しました。出力を確認してください。" -ForegroundColor Red
}
