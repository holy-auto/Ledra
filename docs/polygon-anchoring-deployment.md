# Polygon Blockchain Anchoring — デプロイガイド

Phase 3e のブロックチェーンアンカリング機能を本番 / テストネット環境で稼働させるための手順書。

> **注**: 当ドキュメントは Phase 3e（画像ハッシュの直接 anchor）に関する手順書。証明書 canonical JSON / Merkle batch anchoring の段階的拡張については `docs/anchoring-roadmap.md` を参照。新規コントラクト `LedraCertAnchor.sol` / `LedraBatchAnchor.sol` のデプロイは同 roadmap 実装ステップ S11 で扱う。

## 前提

- **Mainnet（本番）**: 実際のPOLトークンが必要（1件あたり約0.001 POL ≈ 0.1円以下）
- **Amoy（テストネット）**: 完全無料。テスト用POLを公式faucetから取得

## 1. テストネット（Amoy）で動作確認

### 1-1. ウォレット準備

1. MetaMaskに **Polygon Amoy Testnet** を追加:
   ```
   ネットワーク名: Polygon Amoy
   RPC URL: https://rpc-amoy.polygon.technology
   チェーンID: 80002
   通貨記号: POL
   エクスプローラ: https://amoy.polygonscan.com
   ```

2. **テスト用POLを取得**:
   - https://faucet.polygon.technology/ にアクセス
   - Amoy ネットワークを選択、MetaMaskのアドレスを貼り付け
   - 無料で 0.1 POL 程度が即時付与される（1回/24h）

### 1-2. コントラクトデプロイ（Foundry 使用）

```powershell
# Foundryインストール（初回のみ）
irm https://foundry.paradigm.xyz | iex
foundryup

# デプロイ
cd contracts
$env:PRIVATE_KEY = "0xあなたのテスト用秘密鍵"

forge create LedraAnchor.sol:LedraAnchor `
  --rpc-url https://rpc-amoy.polygon.technology `
  --private-key $env:PRIVATE_KEY `
  --broadcast
```

出力される `Deployed to: 0x...` のアドレスをメモ。

### 1-3. 環境変数設定（Vercel / ローカル）

```
POLYGON_ANCHOR_ENABLED=true
POLYGON_NETWORK=amoy
POLYGON_PRIVATE_KEY=0xあなたのテスト用秘密鍵
POLYGON_CONTRACT_ADDRESS=0xデプロイされたアドレス
```

（`POLYGON_RPC_URL` は未設定でOK → デフォルトで Amoy 公式RPCが使われる）

### 1-4. 動作確認

1. Ledra の施工店ポータルから施工写真を1枚アップロード
2. 公開証明書ページを開く
3. **「ブロックチェーン検証済み ↗」** バッジをクリック
4. Amoy Polygonscan で該当txが `Success` になっていることを確認

---

## 2. 本番（Polygon Mainnet）への切り替え

テストで問題なく動いたら、メインネットに切り替えるだけ:

### 2-1. POL購入 & 入金

- **bitbank 推奨**（モバイル送金可、板取引でスプレッド狭い）
- 500円分のPOLで数千件のアンカリングが可能
- MetaMask の Polygon Mainnet アドレスに送金（**必ず Polygon ネットワークを指定**）

### 2-2. Mainnet にコントラクトデプロイ

```powershell
cd contracts
$env:PRIVATE_KEY = "0x本番用秘密鍵"

forge create LedraAnchor.sol:LedraAnchor `
  --rpc-url https://polygon-rpc.com `
  --private-key $env:PRIVATE_KEY `
  --broadcast
```

### 2-3. 環境変数を本番値に更新

```
POLYGON_ANCHOR_ENABLED=true
POLYGON_NETWORK=polygon
POLYGON_PRIVATE_KEY=0x本番用秘密鍵
POLYGON_CONTRACT_ADDRESS=0x本番コントラクトアドレス
```

Vercel で production / preview 環境の環境変数を差し替え、再デプロイ。

---

## 3. 運用上の注意

### 秘密鍵管理
- **Vercel 環境変数（暗号化保管）** で管理
- 本番用ウォレットは **専用の新規ウォレット** を使う（既存の資産と分離）
- 定期的に残高監視し、閾値を下回ったらアラート

### ガス代見積もり
| 件数/月 | Mainnet コスト |
|---------|---------------|
| 1,000 | ~100円 |
| 10,000 | ~1,000円 |
| 100,000 | ~10,000円 |

### 監視
- `polygon_tx_hash IS NULL AND authenticity_grade != 'unverified'` のレコードを監視（アンカリング失敗を検知）
- ウォレット残高が一定値以下になったら通知

### 既存画像の遡及アンカリング（バックフィル）
Phase 3e 以前に発行した施工画像は `sha256` だけ計算済みで `polygon_tx_hash` が NULL の状態。管理者ポータルから一括処理できる:

1. `/admin/polygon-backfill` にアクセス（admin ロール必須）
2. 「残件数」を確認
3. 1 バッチ = 最大 20 件を逐次処理（nonce 競合を避けるため並列化しない）
4. Polygonscan リンクで各件を目視確認可能

内部的には `POST /api/admin/polygon/backfill` がエンドポイント。cron 化する場合は `CRON_SECRET` で保護した別エンドポイントを追加。

### コントラクトのアップグレード
- 現在のコントラクトは固定（非Upgradable）
- スキーマ変更時は新コントラクトをデプロイ → 環境変数更新
- 過去のtxHashは旧コントラクトのアドレスに紐付くが、Polygonscanリンクは引き続き有効

---

## 4. トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `[polygon] anchoring failed: insufficient funds` | ウォレットのPOL残高不足 | POLを補充 |
| `[polygon] anchoring failed: nonce too low` | 並列リクエストでnonceが競合 | リトライで自動解消 |
| 全てのアップロードでtxHashが null | `POLYGON_ANCHOR_ENABLED` が未設定または false | 環境変数を確認 |
| バッジのリンクが表示されない | DBに`polygon_tx_hash`が保存されていない | アップロード時のログ確認 |

---

## 5. ロードマップ

- [ ] Phase 3e-1: Amoy での動作確認完了
- [ ] Phase 3e-2: Mainnet デプロイ
- [ ] Phase 3e-3: 残高監視・アラート設定
- [x] Phase 3f: 保険会社向け検証APIエンドポイント (`GET /api/insurer/anchor-verify/:sha256`)
- [x] Phase 3g: 一括バックフィル (`POST /api/admin/polygon/backfill`, `/admin/polygon-backfill` UI)
