# 証明書発行のオフライン対応 設計

> 作成: 2026-05-20
> ステータス: Phase 1 実装中 (API + idempotency)、Phase 2 未着手
> 関連: `docs/pwa-offline-roadmap.md` §2.1

## 0. ゴール

地方店舗で Wi-Fi が切れた状態でも、施工完了 → 証明書発行 → 写真添付 まで
**業務を止めない**。再接続したタイミングで自動的にサーバに同期される。

---

## 1. 全体フロー

```
[Browser - Online]
  Cert form submit
    │
    ├─ idempotencyKey = UUID() を生成
    ├─ POST /api/admin/certificates
    │    Header: Idempotency-Key: <key>
    │    Body: { customer_name, ... } JSON
    │    → 201 { public_id }
    │
    ├─ 各写真について
    │   POST /api/certificates/images/upload
    │      Body: multipart (public_id + file)
    │
    └─ /admin/certificates/{public_id} へリダイレクト


[Browser - Offline]
  Cert form submit
    │
    ├─ idempotencyKey = UUID() を生成
    ├─ enqueueOrFetch({ body: { ... }, idempotencyKey })
    │    → outbox に投入 (queued)
    │
    ├─ 各写真について
    │   enqueueOrFetchMultipart({
    │     fields: { idempotency_key: <key> },
    │     files: [file],
    │   })
    │   → outbox に Blob 保存 + 投入
    │
    └─ Optimistic UI: 「保留中の証明書 1 件」を表示


[Browser - Reconnect]
  navigator.onLine → online イベント
    │
    ├─ drainOutbox 自動実行
    │   1. cert create item を送信 → 201 { public_id }
    │   2. 後続の image upload は idempotency_key 経由でサーバが public_id 解決
    │   3. 順次送信 → 完了 → item 削除
    │
    └─ OfflineBanner: 「N 件を同期しました」
```

---

## 2. サーバサイド変更

### 2.1 既存 Idempotency 基盤を活用

`src/lib/api/idempotency.ts` に **Redis-backed Stripe 風 idempotency 中間処理が
既に実装済み**。今回はこれをそのまま使う。

- `Idempotency-Key` HTTP ヘッダで claim → ハンドラ実行 → 結果キャッシュ (24h TTL)
- 同一 key + 同一 fingerprint で再送 → キャッシュ応答
- 同一 key で異なる body → 409 Conflict (`idempotency_conflict`)

### 2.2 `POST /api/admin/certificates` 新設

既存の `createCertAction` (Server Action / 380 行) を **直接呼び出すアダプタ** として
新設。Server Action の挙動は変えない。

```ts
export async function POST(req: NextRequest) {
  return withIdempotency(req, "admin:cert:create", async () => {
    const body = await req.json();
    const formData = jsonToFormData(body);
    const result = await createCertAction(formData);
    if (!result.ok) return apiValidationError(result.error);
    return apiOk({ public_id: result.public_id });
  });
}
```

利点:
- Server Action はオンラインフォーム送信の正規パスとして残る (既存 e2e/単体テスト保護)
- JSON API は Outbox / モバイル / 外部連携の入口になる
- ロジック重複ゼロ。FormData ↔ JSON だけマッピング

### 2.3 `POST /api/certificates/images/upload` 拡張

既存の multipart upload に `idempotency_key` フィールドを許容する:
- `public_id` が指定されている → そのまま動作 (互換)
- `idempotency_key` が指定されている → `api_idempotency_keys` から cert を解決
  (まだ作られていなければ 425 Too Early を返して drainOutbox がリトライ)

ただし `withIdempotency` は Redis ベースなので、idempotency キーから cert を
逆引きするには工夫が要る。最も単純なのは:
1. cert create のレスポンスを Redis にキャッシュ (key → public_id)
2. image upload が key を受け取ったら Redis から public_id を引く

これは既存の `idempotency.ts` の `runAndCache` が response.body 全体をキャッシュ
しているので、image upload エンドポイント側で同 key で Redis を見れば
`{ public_id }` が取得できる。新スキーマ不要。

---

## 3. クライアントサイド変更

### 3.1 `src/lib/outbox/enqueueOrFetch.ts` 拡張

オプションに `idempotencyKey?: string` を追加。online/offline 両方で同じ key を
ヘッダに乗せる:

```ts
const headers = {
  ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
  ...(opts.headers ?? {}),
};
```

### 3.2 cert 発行フォーム

`CertNewFormWrapper.tsx` の onSubmit を:
1. ページマウント時に `const idempotencyKey = crypto.randomUUID()` を 1 度だけ生成
   (form ref に保持)
2. submit 時に `enqueueOrFetch` で `/api/admin/certificates` を叩く (idempotency_key 付き)
3. queued=true なら "保留" 通知 + 写真は `enqueueOrFetchMultipart` で同 key を field に乗せて enqueue
4. queued=false なら従来通り success ページへ遷移

Server Action ベースの既存パスはフォールバックとして残す (アダプタ API が
利用不可な環境向け)。

### 3.3 Optimistic UI: 「保留中の証明書」

`OfflineBanner` の表示に加え、`/admin/certificates` 一覧画面に
- "保留中: N 件" バッジ
- queued アイテムのプレビュー (顧客名 + 車両情報 + 投入時刻)

を追加。`listOutbox()` の `kind="certificate_create"` でフィルタした結果を
SWR で取得 (ローカル IDB のため即時)。

---

## 4. Reconciliation (再同期戦略)

### 4.1 成功パス

1. drainOutbox: cert create → 201 + public_id
2. drainOutbox: image upload 1..N → 200
3. 各 item を outbox から削除
4. 「保留中バッジ」が 0 件に減る
5. `router.refresh()` で証明書一覧を再取得 → 新規 cert が表示

### 4.2 部分失敗

cert create が成功し image upload が失敗:
- cert は存在する。`/admin/certificates/[public_id]` ページから手動アップロード可能
- outbox 内の image upload は残ったまま attempts++, lastError 保持
- 次回 drain で再試行

### 4.3 cert create 失敗

- attempts++, lastError 記録、item は残る
- ユーザが OfflineBanner の「今すぐ同期」で再試行 or 手動で outbox から削除して
  再入力 (キャンセル UI を `OfflineBanner` に追加予定)

---

## 5. 既存ロジックとの互換性

### 5.1 副作用: 維持されるもの

- 車両自動作成 / 顧客自動作成 / vehicle_histories 追記
- メーカー認定テンプレ検証 (`resolveCertifiedTemplateForTenant`)
- QStash (`enqueueInsuranceCaseCreated`)
- 発行直後フォローアップ (`triggerPostIssueFollowUp`)

全て `createCertAction` 内で実行され、JSON API はそれを呼ぶだけなので**自動的に維持**。

### 5.2 副作用: 注意

- QStash 通知はオンライン復帰 → 同期完了時に飛ぶ (即時ではない) ことを許容
- 発行時刻 (`certificates.created_at`) はサーバの now() なので、復帰時刻
  になる。クライアントが「オフライン中に発行した時刻」を保持したい場合は
  別カラム (`occurred_at_client` 等) が要る (Phase 2 議論)

---

## 6. テスト戦略

| 層 | 内容 |
|---|---|
| Unit (`createCertAction`) | 既存テスト保護 (変更ゼロ) |
| Unit (`POST /api/admin/certificates`) | idempotency 動作、JSON → FormData 変換 |
| Integration | online → 201 + replay は cache hit |
| Integration | offline enqueue → online drain で cert + image が同期 |
| E2E | Playwright: `route.abort()` で offline 模擬 → 復帰 → 反映確認 |

Phase 1 では Unit のみ。E2E は Phase 2 で。

---

## 7. 実装フェーズ

| Phase | 内容 | ステータス |
|---|---|---|
| **1** | 設計確定 / POST API / Idempotency 連携 / Unit テスト | ✅ 完了 (`9ca2395`) |
| **2** | クライアントフォーム配線 / オフライン時の文字情報 enqueue | ✅ 完了 (`bc4191a`) |
| **3-mini** | 「保留中の証明書」一覧 UI / 手動キャンセル | ✅ 完了 (`b913275`) |
| **3-full** | cert_idempotency_keys 永続マッピング + 画像 upload で逆引き + 写真自動 enqueue | ✅ 完了 (本ブランチ) |
| 4 (将来) | E2E (Playwright route.abort) / 接続不安定下の再試行 stress test | 未着手 |

### Phase 3-full の実装詳細

1. **migration `cert_idempotency_keys`**: `(idempotency_key PK, tenant_id, certificate_id, public_id, expires_at)`。RLS は SELECT のみテナント開放、INSERT は service-role 経由
2. **`src/lib/certificates/idempotencyMap.ts`**: `recordCertIdempotency` / `lookupCertByIdempotencyKey` ヘルパ
3. **`POST /api/admin/certificates`**: cert 作成成功 + idempotency-key ヘッダ有り → mapping を INSERT
4. **`POST /api/certificates/images/upload`**: `cert_idempotency_key` form field を受け入れ、永続マッピングから public_id を逆引き。見つからない場合は **425 Too Early** で drainOutbox に再試行を任せる
5. **`CertNewFormWrapper`**: offline 経路で写真も `enqueueOrFetchMultipart` で enqueue (`cert_idempotency_key` field 付き)。drainOutbox が cert → 写真の順で送信

---

## 8. 後続の論点

- **occurred_at_client**: オフライン時の発行時刻を別カラムで保持するか
  (保険査定の文脈で「現場で何時にやった」が問われる場合)
- **fingerprint 衝突**: 同 key で別 body が来た時の UI (今は 409 を握り潰さない方が良いか?)
- **client-side cert preview**: PDF 生成はサーバ依存なので、queued 中はプレースホルダのみ
