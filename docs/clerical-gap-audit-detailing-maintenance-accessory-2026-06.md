# 事務作業ギャップ監査レポート — ディテイリング / 整備・車検 / 用品取付 (2026-06)

> 作成日: 2026-06-29
> 目的: ディテイリング・整備(車検)・用品取付の 3 業種について、現場スタッフの
> 「1 日の業務」を工程順に辿り、**事務作業のうち Ledra がまだ肩代わりできていない
> 断絶点**をコード根拠付きで特定する。
> 上位方針: 「技術職を技術に集中させ、事務は可能な限り Ledra で代替する」。
> 関連: `docs/body-repair-clerical-gap-audit-2026-06.md`(鈑金・同方式)

---

## 0. エグゼクティブサマリ(3 業種横断)

鈑金監査と同じく、3 業種いずれも **「記録・整合性のバックエンドは高水準だが、
現場が日々触る『連結とラストワンマイル UI』が断絶している」** という共通構造。
新規テーブルはほぼ不要で、**既存資産の結線**で事務負荷の大半が解消できる。

| 業種 | バックエンド完成度 | 現場 UI/結線 | 最重の断絶点 |
|---|---|---|---|
| ディテイリング | 高(証明書・保証・メンテ通知) | 低〜中 | 見積パッケージ UI 未配線 / 保証終了日の自動計算 |
| 整備・車検 | 高(車検OCR・車検満了通知・記録簿) | 低〜中 | **定期点検(6/12ヶ月)の自動起票・通知** |
| 用品取付 | 非常に高(部品装着インテグリティ) | 低 | 現場の装着記録 UI / 見積承認 / 部品適合確認 |

**重要な確認**: 整備の **車検満了リマインドは既に完成・本番運用中**
(`src/lib/cron/inspectionReminders.ts`、日次 cron 登録済み)。当初「次の打ち手」候補に
挙げていたが**実装済み**だった。整備の真の穴は**定期点検サイクルの自動化**。

横断して刺さる low-hanging fruit(鈑金で実装済みの横展開):
- **音声→案件メモ**は鈑金/予約で結線済み(#617)。3 業種とも同じ部品を流用可能。
- **AI 見積→見積書→紐付け**は鈑金で実装済み(#620)。整備・用品取付・ディテイリングへ展開可。

---

## A. ディテイリング業(コーティング / PPF / 洗車・磨き)

保険往復が無い代わり、**保証管理と再来促進**が事務の中心。Ledra は施工証明書発行と
メンテナンスリマインダーの基盤がほぼ完成しており、欠けているのは「見える化と紐付け」。

### A-1. 工程別ギャップ表

| 工程 | 対応 | 実装/断絶点 | 根拠 |
|---|---|---|---|
| 受付・来店 | ✅ | 顧客登録・電話ハッシュ重複検出 | `src/lib/customers/` |
| メニュー/パッケージ選定 | ⚠️ **断絶A1** | `STARTER_PACKAGES`(coating Lv1-3 / PPF / detailing)定義済だが**見積フォーム UI 未配線**、予約への適用も手動 | `src/lib/service-packages/starter-templates.ts` / `ReservationsClient.tsx` |
| 見積作成 | ⚠️ | `expandServicePackage()` は完成だが見積文書への自動展開なし | `src/lib/service-packages/expand.ts` |
| 予約入庫 | ✅ | `reservations.status` / `menu_items_json` | `20260315000002_reservations.sql` |
| 施工(コーティング/PPF) | ✅ | PPF パネル(`ppf_coverage_json`)・コーティング製品トラッキング | `src/lib/ppf/constants.ts` / `20260322000006_ppf_support.sql` |
| 施工写真 | ✅ | `certificate_images.stage` + EXIF + 改ざんアンカリング | `20260620000000_body_repair_transparency.sql` |
| 施工証明書 | ✅ | `certificates` + 写真必須ゲート + パッケージスナップショット | `src/lib/certificates/photoRequirement.ts` |
| **保証開始/期間設定** | ⚠️ **断絶A2** | `certificates.warranty_period_end` カラムはあるが、施工日からの**自動逆算が薄く手入力依存** | `src/lib/ai/followUpContent.ts`(文字列パースのみ) / `20260322000000_cert_expiry_warranty.sql` |
| 保証期間管理 | ✅ | `follow_up_settings` + 月別リマインド + 種別 override | `20260430000000_maintenance_reminder_enhancements.sql` |
| メンテリマインダー(6/12ヶ月) | ✅ | `processMaintenanceReminders()` cron(種別別スケジュール対応) | `src/lib/cron/followUp.ts` |
| 施工記録メモ | ⚠️ **断絶A3** | 音声入力は証明書画面のみ(鈑金/予約は結線済、ディテイリング案件側は未) | `src/app/admin/certificates/new/VoiceMemoPanel.tsx` |
| 請求・入金 | ✅ | `documents(invoice)` + `billing_splits` | — |

### A-2. 断絶トップ3
1. **見積・パッケージ UI 未配線**(中) — `expandServicePackage()` は完成、予約/見積への配線のみ(~100-150行)。
2. **保証終了日の自動計算**(中) — `warranty_period`(例「3年」)→ `warranty_period_end` を施工日から自動算出(~50-100行)。`service_packages.warranty_years` 既定値の追加も有効。
3. **施工メモの現場入力 UI**(小〜中) — `VoiceMemoPanel` を案件側へ流用(鈑金の #617 と同型)。

---

## B. 整備業(車検 / 一般整備 / 定期点検)

車検 OCR・車検満了通知・整備記録簿は**業界水準超**。穴は**定期点検サイクルの自動化**と
見積〜請求の UI 連結。

### B-1. 工程別ギャップ表

| 工程 | 対応 | 実装/断絶点 | 根拠 |
|---|---|---|---|
| 受付/入庫 | ✅ | `reservations` / `body_repair_jobs.intake_at` | `20260315000002_reservations.sql` |
| 車検証 OCR/QR | ✅ | Claude Vision + QR デコード、`expiry_date`/初度登録/型式を抽出・検証 | `src/lib/ocr/shakensho.ts` / `shakensho-qr.ts` |
| 車検有効期限の保持 | ✅ | `vehicles.inspection_expiry_date`(OCR から自動保存) | `20260522000005_vehicles_inspection_expiry.sql` |
| **車検満了リマインド** | ✅ **完成・運用中** | `processInspectionReminders()`(既定60日前・二重送信防止・日次 cron 登録済) | `src/lib/cron/inspectionReminders.ts` / `api/cron/follow-up/route.ts` |
| 見積作成 | ⚠️ **断絶B(=鈑金D)** | AI 見積はあるが整備 UI から未使用・手入力 `estimate_amount` のみ | `src/lib/ai/quoteFromVehicle.ts` |
| 作業指示/計画記録 | ⚠️ | `planned_work_json`/`actual_work_json` はあるが整備向け UI 未配置 | `20260620000000_body_repair_transparency.sql` |
| 整備実施・記録(メモ) | ⚠️ **断絶(音声)** | 音声入力が証明書画面のみ。整備案件側は手打ち | `VoiceMemoPanel.tsx` |
| 整備記録簿(電子) | ✅ | `inspection_records`(チェックリスト+写真+テンプレ snapshot) | `20260612000018_inspection_checklists.sql` |
| 特定整備記録(2年保存) | ✅ | `is_specified_maintenance` + `record_retention_until` | `20260620000000_body_repair_transparency.sql` |
| 請求/入金 | ✅ | `documents(invoice)` + `billing_splits` + `payment_status` | — |
| **定期点検(6/12ヶ月)** | ⚠️ **断絶B1(最重)** | `service_reminders`(`next_due_date`/`next_due_mileage` は GENERATED 列で完成)。だが**自動起票 cron も自動通知 cron も無い**(`api/cron/` に service-reminder 無し) | `20260612000008_service_reminders.sql` |
| 車検→定期点検チェーン | ❌ | 車検完了後の点検自動起票なし | — |
| リコール対応 | ❌ | VIN→リコールDB照合・案内なし | — |

### B-2. 断絶トップ3
1. **定期点検(6/12ヶ月)の自動起票・通知**(最重・実装は ~100-150行) — テーブルと生成列は完成。新規 cron(`api/cron/service-reminders`)で `next_due_date` ≤ 当日+N を抽出 → LINE/メール、+ 作業完了時の `service_reminders` 自動起票。
2. **整備記録の音声入力**(小・~50行) — 鈑金 #617 の横展開。
3. **見積→請求の UI 連結**(小〜中・~100-150行) — 鈑金 #620 の横展開(整備でも `quoteFromVehicle`→見積書→紐付け)。
- 中長期: リコール DB 連携 / 整備記録簿の PDF 自動生成 / 走行距離ベースの交換提案 cron。

---

## C. 用品取付業(ナビ/ドラレコ/ホイール/エアロ 等)

**部品装着インテグリティ(`src/lib/parts/`)が極めて完成度高**(写真真正性 → 三方照合 →
確定署名 → TSA → アンカー → 納車時顧客確認)。欠けているのは**現場が触る運用ワークフロー UI**。

### C-1. 工程別ギャップ表

| 工程 | 対応 | 実装/断絶点 | 根拠 |
|---|---|---|---|
| 受付・顧客登録 | ⚠️ | 予約/インテークはあるが用品取付専用フロー無し | `src/app/customer/[tenant]/booking/` |
| **部品適合確認(車種×部品)** | ❌ **断絶C1(最重)** | `inventory_items` ↔ `vehicles` の適合マッピングが無い。現場は手で互換確認 | (grep: fitment/適合 → 該当なし) |
| 見積作成 | ⚠️ | AI 見積 draft のみ・文書化/請求組込未配線 | `src/lib/ai/quoteFromVehicle.ts` |
| **見積提示・顧客承認** | ⚠️ **断絶C2** | 確定署名機構はあるが**見積→承認の state machine/UI 無し** | `src/lib/parts/confirmationService.ts` |
| 部品発注・仕入 | ✅ | 在庫低減トリガ→自動発注(人承認+API/メール) | `src/lib/supply/placeOrder.ts` / `autoSend.ts` |
| 入荷・在庫記入 | ✅ | `inventory_movements`(納品書 OCR は別途) | `src/app/admin/inventory/` |
| 取付施工 | ⚠️ | API はあるが現場の施工記録 UI 無し | — |
| 装着記録・証拠保存 | ✅ | 写真ハッシュ・改ざん検出・シリアル一意性 | `src/lib/parts/installationService.ts` |
| 三方照合(納品↔請求↔装着) | ✅ | 納品書 OCR + 突合・不一致 finding | `src/lib/parts/reconcileService.ts` / `src/lib/ai/deliveryNoteOcr.ts` |
| 取付証明・確定署名 | ✅ | OTP 所持証明 + 署名 + RFC3161 TSA | `src/lib/parts/confirmationService.ts` / `partSigning.ts` |
| 納車時の顧客確認 | ✅ | 公開リンク(OTP→署名)で電子確定 | `src/app/parts/confirm/[token]/` |
| 請求・分割 | ⚠️ | 部品販売+施工の複合請求フロー不透明 | — |
| **保証・アフター** | ❌ **断絶C3** | `part_installations` に保証期間/範囲のフィールド無し | `20260603000000_part_installations.sql` |

### C-2. 断絶トップ3
1. **現場の装着記録 UI(タブレット)**(高 ROI・~100-200行) — API は完成。写真撮影→自動記録のモバイル UI を載せるだけ。毎日 30-100 分削減見込み。
2. **見積→承認フロー**(中・~300行) — 既存の確定署名機構を見積承認にも適用(見積 PDF 化 + 顧客署名)。
3. **部品適合確認**(中〜大・~500-1000行) — `inventory_items` ↔ `vehicles` 適合マトリックス。初期データ投入が要るが以降は自動化。最大の事務負荷だが着手は重め。
- 加えて: 取付保証(`part_installations.warranty_end_at` 等)/ 入荷 OCR→在庫自動反映 / 用品取付ステージ管理。

---

## 4. 横断ロードマップ(おすすめ着手順)

### 横展開(鈑金で実装済みの資産を 3 業種へ・各小)
- **音声→案件メモ**(#617 同型)を 3 業種の案件/予約フォームへ。
- **AI 見積→見積書→紐付け**(#620 同型)を整備・ディテイリング・用品取付へ。

### 短期(各 ~50-150行)
- 整備: **定期点検 cron**(`service_reminders` の自動通知)— 最重・最高 ROI。
- ディテイリング: **保証終了日の自動計算** + **パッケージ→見積 UI 配線**。
- 用品取付: **タブレット装着記録 UI** + 入荷 OCR→在庫自動反映。

### 中〜長期
- 用品取付: 見積承認フロー / 部品適合マトリックス / 取付保証。
- 整備: リコール DB 連携 / 整備記録簿 PDF / 走行距離ベース交換提案。
- ディテイリング: 顧客向け保証ポータル / 推奨メンテサイクル提案。

---

## 5. 結論

3 業種とも鈑金と同じく **「エンジンは出来ている、運転席(UI)と結線が足りない」**。
最短で効くのは **整備の定期点検 cron**(テーブル完成済・通知 cron 追加のみ)と、
**用品取付のタブレット装着記録 UI**(API 完成済・現場 UI 追加のみ)。いずれも
新規スキーマほぼ不要で、鈑金で確立した結線パターンの横展開で実現できる。

> 本レポートは現状コードの読み取り監査であり、実装は含まない。着手時は横展開と
> 短期項目から、既存資産の再利用を優先する。
