# MetaMask 署名ウォレットのセットアップ

Ledra の Polygon ブロックチェーンアンカリング機能（`src/lib/anchoring/providers/polygon.ts`）で使用する **署名専用ウォレット** を MetaMask で作成し、`POLYGON_PRIVATE_KEY` に設定するまでの手順です。

> **重要:** ここで取得する秘密鍵は絶対にコミット・チャット・クラウドに貼り付けないでください。
> また、資産を保有するメインアカウントは署名用に流用せず、**署名専用の新規アカウント**を作ってください。

---

## 運用方針

本プロジェクトでは次の順序で秘密鍵を反映します。

1. **Vercel の環境変数に先に登録する**（本番・Staging・Preview の各環境）
2. ローカルには **`vercel env pull .env.local`** で取得する
   - こうすることで「ローカルの `.env.local` を手で編集して秘密鍵を貼る → 誤ってコミット」の事故を防ぎます
   - `.env.local` は `.gitignore` 済みですが、源泉を Vercel 側に置くことで一元管理できます

---

## 1. 事前準備

- Chrome / Brave / Firefox / Edge のいずれかのブラウザ
- 公式サイトから MetaMask をインストール: <https://metamask.io/download>
  - 偽の拡張機能が多いため、必ず公式ドメイン経由で入れること

## 2. ウォレット（シードフレーズ）を新規作成

既に MetaMask のウォレットがある場合は **3. アカウント追加** に進んでください。

1. 拡張機能アイコン → **「新しいウォレットを作成」**
2. 拡張機能ロック用のパスワードを設定
3. **シークレットリカバリーフレーズ（12 語）** が表示される
   - 紙にオフラインで書き、物理的に安全な場所に保管
   - スクリーンショット・クラウド保存・チャット貼り付けは禁止
4. 単語を順番に入力して確認 → 作成完了

## 3. 新規アカウント（署名用アドレス）を追加する

同じシードフレーズから複数アドレスを派生できます。

1. MetaMask 右上の **アカウントアイコン** をクリック
2. **「アカウントを追加またはハードウェアウォレットを接続」**
3. **「アカウントを追加」** → 名前を入力（例: `ledra-polygon-signer`）
4. 新しい `0x...` アドレスが生成される

## 4. 秘密鍵をエクスポート

1. 署名用アカウントを選択した状態で右上の **「︙」(3点メニュー)**
2. **「アカウントの詳細」**
3. **「秘密鍵を表示」**
4. MetaMask のパスワードを入力
5. **「押し続けて秘密鍵を表示」** を長押し
6. `0x` で始まる 64 文字の 16 進文字列が表示される → これが `POLYGON_PRIVATE_KEY` の値

## 5. Vercel に登録する（先にこちらを実施）

### 5-1. Vercel Dashboard から登録する場合

1. プロジェクトを開く → **Settings** → **Environment Variables**
2. 次のキーを登録
   - `POLYGON_ANCHOR_ENABLED` = `true`
   - `POLYGON_RPC_URL` = `https://rpc-amoy.polygon.technology`（Amoy テストネットの例）
   - `POLYGON_PRIVATE_KEY` = エクスポートした `0x...` で始まる秘密鍵
   - `POLYGON_CONTRACT_ADDRESS` = デプロイ済みアンカーコントラクトのアドレス
3. 環境は **Production / Preview / Development** の必要なものにチェック
   - `POLYGON_PRIVATE_KEY` を Preview に入れる場合はテストネット用の鍵に限定すること

### 5-2. Vercel CLI から登録する場合

```bash
vercel env add POLYGON_ANCHOR_ENABLED production
vercel env add POLYGON_RPC_URL production
vercel env add POLYGON_PRIVATE_KEY production
vercel env add POLYGON_CONTRACT_ADDRESS production
```

入力プロンプトに値を貼り付けます。プロンプト経由で入力した値はシェル履歴に残りません。

## 6. ローカル（`.env.local`）に反映する

Vercel に登録したあと、次のコマンドで手元に取得します。

```bash
# 初回のみ: プロジェクトと紐付け
vercel link

# 環境変数をローカルに展開（development 環境）
vercel env pull .env.local
```

`.env.local` に `POLYGON_*` が展開されていれば完了です。

```bash
grep '^POLYGON_' .env.local
```

- `.env.local` は `.gitignore` 済みのためコミットされません
- 値を差し替えたいときは **Vercel で更新 → `vercel env pull` を再実行** の順で同期する

## 7. 動作確認

```bash
npm run dev
```

起動ログに `POLYGON_ANCHOR_ENABLED`, `POLYGON_RPC_URL`, `POLYGON_PRIVATE_KEY`, `POLYGON_CONTRACT_ADDRESS` に関する WARN が出ないこと、
および `src/lib/anchoring/providers/polygon.ts` の `anchorToPolygon` がトランザクションを送出できることを確認します。

## 8. セキュリティ上のルール

| やってはいけないこと | 理由 |
|---|---|
| 秘密鍵を Git にコミットする | 履歴から完全削除できず、push 済みなら即流出扱い |
| 秘密鍵を Slack / メール / チャットに貼る | ログ・通知・転送で漏えいする |
| シードフレーズをクラウド保管 | クラウド侵害で全アカウントを失う |
| 資産を持つアカウントを署名に流用 | 鍵漏えい時に資産も失う |
| 本番用の秘密鍵を Preview 環境に入れる | PR プレビューで意図せず本番鍵が使われる |

**推奨**: 署名専用アカウントには最低限のガス代（Amoy なら Faucet で入手）だけを入れ、漏えい時の被害範囲を署名権限のみに限定する。

---

## 関連ファイル

- `src/lib/anchoring/providers/polygon.ts` – 署名ウォレットを利用するアンカリング実装
- `src/lib/envValidation.ts` – `POLYGON_*` の起動時チェック
- `.env.example` – `POLYGON_*` のキー雛形
