# 施工証明書 写真添付必須ルール

施工証明書 (`certificates`) は **`active` (発行済み) になるには施工写真
(`certificate_images`) が最低 1 枚必要** という、全テナント一律のプラットフォーム
ルールを持つ。写真ゼロの証明書は発行できず、`draft` (下書き) としてのみ保存できる。

## なぜチョークポイントで強制するのか

証明書本体の作成と写真アップロードは別エンドポイントに分かれており、新規作成
時点では写真が必ず 0 枚になる:

```
作成 (status=draft)  →  写真アップロード (/api/certificates/images/upload)  →  発行 (draft→active)
```

そのため「作成時に active で起こす」経路は廃止し、**発行 = 活性化 (draft→active)**
の瞬間に写真有無をサーバ側で検証する。これにより UI・JSON API・モバイル・オフライン
同期のどの経路から来ても同じガードを通る。

## ルール本体

- `src/lib/certificates/photoRequirement.ts`
  - `MIN_CERTIFICATE_PHOTOS = 1`
  - `countCertificatePhotos(admin, certificateId)` / `certificateHasRequiredPhotos(admin, certificateId)`
  - `CERTIFICATE_PHOTO_REQUIRED_MESSAGE` — ブロック時にユーザへ返す文言

## 作成は必ず draft

| 経路 | 挙動 |
| ---- | ---- |
| `createCertAction` (Server Action / `POST /api/admin/certificates`) | `status=active` を要求されても **draft で作成**し、`{ photo_required: true }` を返す |
| `POST /api/certificates/create` | 同上 (active 要求でも draft で insert) |

## 発行 (active 化) チョークポイント — ここで写真必須を強制

| 経路 | 用途 |
| ---- | ---- |
| `PUT /api/admin/certificates/status` (`draft→active` / `void→active`) | web 管理画面の発行 / 再発行 |
| `POST /api/mobile/certificates/[id]/activate` (`draft→active`) | モバイルアプリの発行 |
| `POST /api/certificates/activate-by-key` (`draft→active`) | オフライン同期専用 (idempotency-key で証明書を逆引きして発行) |

いずれも `certificateHasRequiredPhotos` が false なら `400` +
`CERTIFICATE_PHOTO_REQUIRED_MESSAGE` を返してブロックする。

> **新しい「active 化」経路を追加する場合は、必ず同じガードを先頭で通すこと。**

## 発行副作用 (issueHooks)

従来 `createCertAction` (作成時) で発火していた「保険案件の QStash enqueue」
「発行直後フォローアップ」は、発行が活性化に移ったことに伴い
`src/lib/certificates/issueHooks.ts` の `triggerCertificateIssued` に集約し、
**初回発行 (draft→active) のチョークポイントでのみ** 発火する。

- `void→active` の再発行では発火しない (二重通知防止)。
- fire-and-forget。失敗しても発行 (status 更新) 自体は止めない。

## クライアント (web 新規発行フォーム)

`src/app/admin/certificates/new/CertNewFormWrapper.tsx`:

- 「発行する」を押した時点で写真が 0 枚なら、サーバへ行く前にブロックして
  「写真を追加」か「下書き保存」へ誘導する。
- オンライン発行フロー: 作成 (draft) → 写真 upload → `PUT .../status {status:active}`。
  写真 upload が失敗していれば status ルートが弾くため、下書きのまま残る。
- オフライン発行フロー: outbox に 作成 (draft) → 写真 upload → `activate-by-key`
  の順で enqueue。復帰後に順次送信され、サーバ側で再度写真有無を検証する。
- 「下書き保存」は active 化しない (写真ゼロでも保存可)。

写真欄 (`PhotoUploadSection`) のラベルは **「必須（発行には1枚以上）」**。

## テスト

- `src/lib/certificates/__tests__/photoRequirement.test.ts` — 枚数判定の境界
- `src/app/api/admin/certificates/__tests__/status-photo-gate.test.ts` — status ルートの
  発行ブロック / 発行フック発火 / 再発行時の非発火
