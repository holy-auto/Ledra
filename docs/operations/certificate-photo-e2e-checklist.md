# モバイル証明書写真 E2E 検証手順書

対象: モバイルの「証明書写真キャプチャ → WEB 真正性パイプライン統一」機能
（撮影 → アップロード → 有効化ゲート → 端末保存 → WEB DL）。導入は PR #905。

> 記載のエンドポイント・DB列・ゲート条件・段階値は `main`（`e3a3d997`, 2026-10-05 時点）の
> 実コードで確認済み。コードが変わったら本書も同一 PR で更新すること。

---

## 0. 事前準備

- テスト用テナント（**本番テナントは使わない**）。有効化は保険案件 enqueue・フォローアップ等の
  副作用（`triggerCertificateIssued`）を発火させるため、実顧客データに撃たない。
- staff 以上のロールを持つテストユーザーのモバイル Bearer トークン。
- 実機（iOS / Android 実端末）。撮影・OS権限・端末保存は実機でしか確認できない。
- WEB 管理画面にログインできる同テナントの管理ユーザー。

---

## A. 手動 実機E2E（実端末が必須の全経路）

| # | 手順 | 合否条件 | 確認先 |
|---|------|----------|--------|
| A1 | モバイルで証明書を新規作成（下書き） | `id`/`public_id` が返り、下書きが作成される | `POST /api/mobile/certificates` 応答 / `certificates.status='draft'` |
| A2 | 写真を付けずに「発行」を試す | **ブロックされる**（写真必須メッセージ） | 「施工写真が1枚以上必要です」表示 |
| A3 | 証明書の写真画面でカメラが強制起動する（ライブラリ選択が無い） | カメラのみ。端末ギャラリー選択の導線が無い | `pickImageFromCamera()`（`apps/mobile/src/app/certificates/[id]/photos.tsx`） |
| A4 | 段階「施工前(入庫時)」で撮影→アップロード | 「アップロード済み: 1枚」。端末カメラロールに保存されていない | `certificate_images` に stage=`intake_before` が1行 |
| A5 | 段階「施工後」で撮影→アップロード | 同上（stage=`after`） | `certificate_images` に stage=`after` が1行 |
| A6 | 有効化ゲートを通過して発行 | 走行距離未入力なら走行距離要求で止まる→入力後 active | `certificates.status='active'` |
| A7 | 証明書詳細で写真が段階/グレードチップ付きで表示される | サムネイル表示・段階・authenticity_grade が出る | `certificate_images.medium_path`/`stage`/`authenticity_grade` |
| A8 | 「端末に保存」ボタンで写真をDL | 権限ダイアログ→「端末に保存しました」→カメラロールに存在 | `expo-media-library saveToLibraryAsync`（`certificates/[id]/index.tsx`） |
| A9 | WEB 管理画面で同じ証明書の写真をDL | 公開/署名URLで画像がDLできる | `assets` バケットの公開URL |

### 有効化ゲートの全条件（A6 で満たす必要があるもの、実コード準拠）

`evaluateCertificateActivationGate`（`src/lib/certificates/activationGate.ts`）+ activate ルートが強制:

1. **写真1枚以上**（`required_evidence_present`, `MIN_CERTIFICATE_PHOTOS=1`）
2. **未解決の顧客懸念なし**（`no_unresolved_alerts`, `customer_concerns`。reservation_id 経由）
3. **部品整合性**（`parts_integrity`, `part_integrity_findings`。reservation_id 経由）
4. **走行距離入力済み**（`maintenance_json` の走行距離。activate ルートで別途必須）
5. **コーティング/PPF のみ**: Before/After メディア必須（`certificate_media`, `media_type='before_after'`。
   これは stage タグの前後写真とは**別系統**。service_type が coating/ppf のときだけ）

> 注意: A4/A5 の stage=intake_before/after は「サイン依頼」の前後ゲート用。
> 通常の発行（draft→active）は写真1枚（条件1）で足りる。前後ゲート・coating/ppf の
> Before/After は別チョークポイント。テスト対象の service_type に応じて確認範囲を変える。

---

## B. 半自動 サーバーパイプライン検証（プレビュー/ステージング + テストトークン）

実機カメラ・OS権限・端末保存（A3/A8）以外のサーバー側全経路を、curl/スクリプトで検証できる。
**実機が無くてもここまでは自動で通せる。**

前提: `BASE`（プレビュー/ステージングURL）、`TOKEN`（staff の Bearer）、`test.jpg`（適当なJPEG）。

```bash
BASE="https://<preview-or-staging>"      # 本番URLは使わない
TOKEN="<staff bearer token>"
AUTH=(-H "Authorization: Bearer $TOKEN")

# B1. 下書き作成（body は certCreateJsonSchema / モバイル new.tsx のフォーム項目に合わせる）
CREATE=$(curl -s "${AUTH[@]}" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: e2e-$(date +%s)-$RANDOM" \
  -d '{ /* 顧客・車両・service_type 等を certCreateJsonSchema 通りに */ }' \
  "$BASE/api/mobile/certificates")
ID=$(jq -r .id <<<"$CREATE")            # 詳細/写真は uuid で引く
echo "created: $CREATE"

# B2. 写真ゼロで有効化 → 400 + 写真必須メッセージを期待（ゲートが効いていることの証明）
curl -s -o /dev/null -w "%{http_code}\n" "${AUTH[@]}" -X POST \
  "$BASE/api/mobile/certificates/$ID/activate"   # => 400 期待

# B3. capture-nonce 取得
NONCE=$(curl -s "${AUTH[@]}" "$BASE/api/mobile/certificates/$ID/capture-nonce" | jq -r .capture_nonce)

# B4. 単一 multipart でアップロード（撮影セッション相当。nonce はリクエストにつき1回消費）
curl -s "${AUTH[@]}" -X POST \
  -F "files=@test.jpg;type=image/jpeg" \
  -F "stage=intake_before" \
  -F "capture_nonce=$NONCE" \
  -F "device_token=<attestation-or-empty>" \
  -F "device_provider=<play_integrity|app_attest|none>" \
  "$BASE/api/mobile/certificates/images/upload"   # => {"uploaded":1} 期待
```

- **B5. DB 確認**（Supabase）: `certificate_images` に該当 `certificate_id` の行があり、
  `storage_path` / `stage` / `authenticity_grade` / `sha256` が入っていること。
- **B6. 走行距離**: `maintenance_json` に走行距離を入れる（未入力だと B7 が走行距離要求で止まる）。
- **B7. 有効化**: `POST /api/mobile/certificates/$ID/activate` → 200 + `status:active` を期待。
- **B8. WEB DL**: `certificate_images.storage_path` を `assets` バケットの公開/署名URLに変換してGET→200。

### B が検証できること / できないこと

- 検証できる: 認証・ロール、写真必須ゲート、nonce 発行/消費、ハッシュ・GPS/EXIF除去・
  TSA封印・グレード判定（`uploadHandler`）、DB書き込み（storage_path/stage/grade）、有効化遷移、WEB側DL。
- 検証できない（実機のみ・A側）: カメラ強制起動（A3）、端末保存＝カメラロール書き込み（A8）、
  OS権限ダイアログ。
- 真正性グレードの注意: **端末アテステーション（Play Integrity / App Attest）は未実装**のため、
  実機でも `verified` には届かない（nonce により `basic` 超まで）。B の `device_token` を空/none で
  送るとグレードは `basic` 相当に落ちる想定。「grade が verified になるはず」で判定しないこと。

---

## 失敗時の切り分け

- アップロードが 401/403 → トークンのロールが staff 未満か失効。
- `uploaded:0` / 4xx → nonce 期限切れ/二重消費（撮影セッションごとに取り直す）、または `stage` 不正
  （`intake_before`/`in_progress`/`after` 以外は `unspecified` に正規化される）。
- 有効化が 400 → ゲート5条件のどれか（メッセージが最初の不足条件を返す）。写真/懸念/部品/走行距離/
  coating・ppf の Before/After を順に確認。
- WEB DL が 404 → `storage_path` とバケット名（`assets`）の不一致、または署名URL期限切れ。

---

## 未確定 / 要確認

- プレビュー/ステージング環境と、そこで使えるテスト用テナント・staff トークンの有無。
- `device_token` を空で送ったときにアップロードが通るか（アテステーション必須化の有無）。
  実装上グレードは basic 想定だが、拒否されるか通るかは実挙動で確認が要る。
- coating/ppf を対象にするなら `certificate_media`（Before/After）投入経路も B に足す必要がある。
