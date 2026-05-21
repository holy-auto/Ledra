# PWA オフライン耐性 ロードマップ

> 作成: 2026-05-20
> 関連: `src/lib/outbox/`, `src/components/OfflineBanner.tsx`, `public/sw.js`

## 0. ゴール

地方店舗や Wi-Fi 不安定な工場で **Ledra を業務基盤として使い続けられる** 状態。
切断中にも「次のアクション」を継続でき、復帰後に自動同期する体験。

---

## 1. 完了 (Stage 1 + 2 + 3-partial)

### Stage 1: 基盤 (`feat(pwa): オフライン耐性 (Stage 1)`)
- `public/sw.js` + `manifest.json` (元から存在、登録済)
- `src/lib/outbox/queue.ts` - IndexedDB ベースの汎用キュー (`enqueueOutbox` / `listOutbox` / `drainOutbox` 等)
- `src/lib/outbox/types.ts` - `OutboxItem` / `EnqueueInput`
- `src/components/OfflineBanner.tsx` - グローバル UI (オフライン中 / 同期待ち件数 / 手動同期)
- 自動同期: `online` イベントで `drainOutbox()` を 1 回試行

### Stage 2: 案件ワークフロー配線 (`feat(pwa): オフライン耐性 (Stage 2)`)
- `src/lib/outbox/enqueueOrFetch.ts` - JSON 用ラッパ
- `JobStatusPanel.advanceStatus` / `changeAssignee` を outbox 経由に変更
- 切断時は queued=true で「📡 オフライン、ネット復帰後に同期します」を表示

### Stage 3-partial: multipart 対応 + 写真追加アップロード (`feat(pwa): オフライン耐性 (Stage 3)`)
- `OutboxMultipart` 型追加 (`fields` + `files (blobRef)`)
- `ledra-outbox` IDB を v2 に migration (`blobs` ストア追加)
- `putOutboxBlob` / `getOutboxBlob` / `removeOutboxBlobs` - Blob 永続化
- `enqueueOrFetchMultipart.ts` - multipart 用ラッパ
- `drainItems` が multipart 時に FormData を再構築
- **CertImageUpload (`/admin/certificates/[public_id]`)** をオフライン対応
  - 既存証明書への追加写真アップロードのみ (新規証明書発行は未対応、§2 参照)

---

## 2. 残課題 (Stage 3-full)

### 2.1 証明書発行の完全オフライン化

現状の `createCertAction` (`src/app/admin/certificates/new/actions.ts`) は
Server Action で、以下の依存を持つため単純な Outbox 化が出来ない:

- 内部で `templates` / `tenants.logo_asset_path` / `manufacturers` 等を server-side で
  fetch → schema_snapshot を埋め込む
- 発行直後に `enqueueInsuranceCaseCreated` (QStash) を呼ぶ
- `public_id` を server で生成

#### 必要な作業

1. **idempotency_key 受入**: cert 作成 API を idempotency-key ヘッダ対応に
   (Stripe 風)。クライアントは UUID を生成して header に乗せる
2. **Server Action → JSON API への移行**: `POST /api/admin/certificates` を新設
   (現 Server Action の中身を移植 + idempotency-key 対応)
3. **クライアント側 reconciliation**:
   - オフライン時に楽観的な仮 `public_id` (client UUID) を発行 → ローカル表示
   - drain 成功時に server から返る正の `public_id` を、tab 内 store で差し替え
   - 画像アップロードは「cert を待ってから」ではなく、同じ idempotency-key で
     並列キューに乗せる (server 側で cert 未作成なら 425 等を返し再試行)
4. **AI 品質チェック / Polygon アンカリング**: オフライン中は当然走らない。
   復帰後の cron / outbox-flush で自動的に処理。既存 `polygon-signer` cron が
   役立つ
5. **UI**: 「保留中の証明書」リスト表示 + 失敗時の手動再試行 UI

工数見積: 5〜7 日 (testing 込み)。

### 2.2 reservation_update 以外の JSON API も outbox 経由に

候補:
- 顧客作成 / 編集 (`POST/PUT /api/admin/customers`)
- 請求書ステータス変更 (`PUT /api/admin/invoices`)
- 在庫移動 (`POST /api/admin/inventory/movements`)
- メニュー品目編集 (`PUT /api/admin/menu-items/[id]`)

それぞれ呼び出し箇所で `enqueueOrFetch` に差し替えるだけ。

### 2.3 Background Sync API ✅ 完了 (別ブランチ `claude/pwa-background-sync-r2y3Z`)

ブラウザに `serviceWorker.sync.register("drain-outbox")` を登録し、タブが
閉じていても OS レベルで再接続を検知して drain する仕組み。Chromium 系で
動作 (Firefox/Safari は未対応だが、既存の online イベント経路にフォールバック)。

実装:
- `public/sw.js` に `sync` / `message` イベントハンドラ + 最小 IDB 実装
  (queue.ts のスキーマと一致。multipart Blob も再構築)
- `src/lib/outbox/backgroundSync.ts`:
  - `registerOutboxBackgroundSync()` — enqueue 後に呼ぶ
  - `triggerSwDrainOutbox()` — postMessage で SW に即同期トリガ
  - `subscribeOutboxDrainedFromSw()` — SW からの "outbox-drained" 通知を購読
- `enqueueOrFetch` / `enqueueOrFetchMultipart` で enqueue 完了後に
  `registerOutboxBackgroundSync()` を発火
- `OfflineBanner` がマウント時に登録し、SW からの drain 完了通知で UI 更新

### 2.4 オフライン読み取り (写真キャッシュ)

- 直近の certs / reservations を IDB にキャッシュし、オフライン中も閲覧可能に
- 既存 SW は静的アセットのみ。HTML/JSON の network-first → cache-fallback を
  選択的に追加 (Workbox 不使用、手動実装)

工数見積: 3〜5 日。

---

## 3. 設計原則

1. **冪等性ファースト**: PUT/POST は server で重複検知 (409 を outbox は成功扱い)
2. **Blob は別ストア**: `OutboxItem` 本体は JSON シリアライズ可能に保つ
3. **失敗を消さない**: 配信失敗時も outbox に残し、attempts/lastError を保持。
   UI で確認 → 手動再試行できる
4. **Fall-through 戦略**: enqueueOrFetch 系は online 直接 fetch とテスト中の
   挙動が同じ。オフライン耐性は「あったほうがいい」加飾レイヤ
5. **資源管理**: `removeOutboxItem` が `multipart.files[].blobRef` も GC

---

## 4. テスト戦略

| レベル | 内容 |
|---|---|
| Unit (`drainItems`) | online/offline、HTTP 成功/失敗、multipart 再構築、blob missing |
| Unit (`enqueueOrFetch`) | online passthrough、offline enqueue、network error fallback |
| Unit (`enqueueOrFetchMultipart`) | 同上 + Blob 保存 |
| Integration (現状未着手) | 実 IDB を使った enqueue → drain の往復 (fake-indexeddb 依存追加が必要) |
| E2E (現状未着手) | Playwright で `route.abort()` → online 復帰 → 反映を確認 |

---

## 5. 未着手だが優先度高いもの (まとめ)

1. ⭐ 証明書発行の完全オフライン化 (§2.1) — 業務継続性に直結
2. ⭐ Background Sync API (§2.3) — タブが閉じてても同期
3. ◯ オフライン読み取り (§2.4) — 圏外で過去データ閲覧
4. ◯ JSON API 他箇所への横展開 (§2.2)
