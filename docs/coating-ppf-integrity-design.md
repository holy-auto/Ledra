# コーティング・PPF施工インテグリティ設計

> ステータス: **Phase 1 実装済み**
> 目的: コーティング・PPF施工証明書について、「ごまかされたデータの検知」「後からの改ざん耐性」を、
> 部品交換用に作った基盤（`docs/parts-installation-integrity-design.md`）を再利用し、
> **現場の作業を一切増やさずに**実現する。

---

## 1. 背景

`docs/parts-installation-integrity-design.md` で設計・実装した「顧客OTP確認→電子署名で確定」フロー
（`part_installations` / `part_confirmation_signatures`）は、**部品交換専用**として作られたもので、
コーティング・PPFの施工証明書には適用されていなかった。

一方、証明書全般（コーティング・PPF含む）には元から次の3層防御がある（社内ピッチ資料スライド5）:

1. AI写真改ざん検知
2. SHA-256ハッシュ＋Polygonオンチェーン記録
3. 4段階Authenticity Grade（C2PA＋deepfake検知＋端末アテステーション）

これは`certificate_images`（写真そのものの真正性）を守るもので、**「入力された施工データが最初から
真実か」**（材料のすり替え、使い回し写真、水増し請求）は別の脅威であり、対策が抜けていた。

膜厚(NexPTG)は別途モバイルアプリ展開・スマートグラス導入のタイミングで扱うため、本設計では対象外。

---

## 2. 対応する脅威（部品設計書の脅威モデルを踏襲）

| # | 脅威 | 具体例 |
|---|---|---|
| T1 | 偽データ入力 | 施工していないのに証明書だけ発行、比較写真なしで「施工した」と主張 |
| T2 | 写真の使い回し | 別の車の施工前後写真を使い回す |
| T5 | 調達不正 | 安価な材料を使って高級ブランド品として請求 |
| T6 | 数量水増し | 1本のコーティング剤を実際より多い台数分の証明書に計上 |

物理的な部品すり替え（T4）や、なりすまし確定（T7）は部品交換特有の脅威であり、コーティング・PPFの
消耗品（個体識別なし・車に残らない）には当てはまらないため、**OTP確認＋顧客電子署名（L5）はスコープ外**。
Phase 1 は L0（写真）・L2/L3（材料の三方照合・数量突合）・L7（自動検知）のみを対象とする。

---

## 3. 設計原則（「現場工数の最小化」を最優先）

既に現場が普段からやっている作業に相乗りする。新しい入力ステップ・新しい機材・新しい提出書類は増やさない。

1. **Before/After写真** — 施工前後の比較写真は元々多くの現場で撮影されている。「任意」を「発行必須」に
   引き上げるだけ。
2. **材料の納品書** — コーティング剤・PPFフィルムを仕入れた時点でどのみち受け取る納品書を撮るだけ。
   部品交換で作った納品書OCR＋三方照合パイプラインをそのまま使う。
3. **新テーブルを作らない** — コーティング剤・PPFフィルムは「個体識別のない消耗品」であり、部品交換の
   `part_kind='consumable'` にそのまま合致する。`part_installations` に `certificate_id` を追加するだけで
   済む（設計書 §5 の防御マトリクスで元々「液体・消耗品」は「L3三方照合＋在庫数量突合」に分類されていた）。

---

## 4. アーキテクチャ（部品交換基盤の再利用）

```
証明書作成 (coating/ppf, coating_products_json 入力あり)
   │
   ▼
part_installations 行を自動生成（part_kind='consumable', certificate_id=証明書ID）
   │  … 部品交換と全く同じテーブル・同じ処理。job_order_id の代わりに certificate_id で紐付け。
   │
   ├─▶ /admin/parts-integrity/[installationId] … 監査ダッシュボードに自動で乗る（変更不要）
   ├─▶ 納品書アップロード → AI-OCR → 三方照合（reconcileService） … そのまま使える
   ├─▶ 写真sha256/知覚ハッシュ重複検知（installationService） … そのまま使える
   └─▶ part_integrity_findings（qty_mismatch / three_way_mismatch 等） … そのまま使える

証明書発行 (draft→active)
   │
   ▼
Before/After写真 (certificate_media, media_type='before_after') が1件以上あるか強制チェック
   （coating/ppf のみ。他の service_type には影響しない）
```

L0（写真真正性）は元から`certificate_images`パイプラインが全証明書タイプに効いているため変更不要。

---

## 5. 実装内容（Phase 1）

### 5.1 スキーマ

`supabase/migrations/20260703000000_coating_ppf_integrity.sql`
`supabase/migrations/20260703000001_coating_ppf_integrity_index.sql`（支援索引・CONCURRENTLY、別ファイル）
- `part_installations.certificate_id`（`certificates(id)` への nullable FK）を追加。
  `job_order_id` と排他ではなく併用可（部品交換は job_order 経由、コーティング/PPFは certificate 経由）。
- content_hash の正準マニフェスト（`contentHash.ts`）には含めない
  （コーティング/PPFはPhase 1でOTP確定フローを使わないため、署名対象を巻き込む必要がない）。

### 5.2 コーティング剤/PPFフィルムの自動記録

`src/lib/parts/coatingIntegration.ts`
- `recordCoatingConsumableInstallations()` — 証明書作成時（`src/app/admin/certificates/new/actions.ts`）に、
  入力済みの `coating_products_json` の各行を `part_installations`（`installationService.createInstallation`）
  に変換して記録する。**ベストエフォート**（失敗しても証明書発行はブロックしない — 施工データそのものは
  証明書本体に残るため、インテグリティ記録の欠落は監査対象にはなるが業務を止めない）。
- 部位・製品名が空の行はスキップ（`isTrackableCoatingRow`）。

これにより、部品交換と同じ写真重複検知・シリアル/ロット記録・納品書三方照合の仕組みが
コーティング剤・PPFフィルムにも自動的に適用される。**現場が入力する項目は既存のまま変わらない。**

### 5.3 Before/After写真の必須化

`src/lib/certificates/photoRequirement.ts`
- `certificateHasRequiredBeforeAfterMedia()` — `service_type` が `coating`/`ppf` の場合のみ、
  `certificate_media`（`media_type='before_after'`）が1件以上あるかを発行時に強制する。
- 3つの発行(activate)エンドポイントすべてに追加済み:
  `api/admin/certificates/status`, `api/mobile/certificates/[id]/activate`, `api/certificates/activate-by-key`。
- `certificate_media` は元々 `before_after` に before_path/storage_path(after) の両方を要求する
  DB制約があるため、1行存在すれば前後写真が揃っている証拠になる。

### 5.4 監査ダッシュボード

`/admin/parts-integrity` および `/admin/parts-integrity/[installationId]` は `tenant_id` スコープの
`part_installations`/`part_integrity_findings` を読むだけで、`job_order_id` の有無を問わない。
そのためコーティング/PPF由来の装着レコードも**コード変更なしで**同じ画面に表示される。

---

## 6. 段階導入・今後

- **Phase 1（本設計・実装済み）**: Before/After必須化、消耗品としての `part_installations` 自動記録、
  既存の納品書OCR・三方照合・写真重複検知の適用。
- **Phase 2（任意）**: `coating_products_json` の `product_id` を `inventory_items` に正式にFK化し、
  仕入れ（`purchase_orders`）との自動突合を強める。現状は納品書OCRの三方照合で代替可能。
- **延期（膜厚以外の測定値検知）**: 該当なし（膜厚はNexPTGで別途対応）。
- **延期（膜厚・L1入口プロベナンス）**: モバイルアプリ展開／スマートグラス導入のタイミングで再検討。
  部品交換設計書 §9 と同じ理由（装置側署名は原理的に困難）で、現時点では着手しない。

---

## 7. 残存リスク（明記）

- Before/After写真は「撮った」ことは強制できても、**写真が本当にその施工の前後か**は`exif_captured_at`と
  `certificate_images`の重複検知に依存する（完全な保証ではない）。
- コーティング剤/PPFフィルムの三方照合は、店が納品書をアップロードして初めて働く。アップロードは
  現状**任意**（監査ダッシュボードで未提出を検知できるが、業務フロー上の強制はしていない）。
- 部品交換のOTP確認＋顧客電子署名（L5/L6の完全凍結）は本設計のスコープ外。コーティング/PPFの
  `part_installations` レコードは `installed` のままで、顧客による確定・凍結は行わない
  （消耗品でなりすまし確定のリスクが低いため、Phase 1では見送り）。
