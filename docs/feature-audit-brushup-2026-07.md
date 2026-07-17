# 全機能 棚卸し ＋ ブラッシュアップ提案（2026-07）

> 目的: 肥大化した Ledra の機能面を **業務ドメイン軸で4等分して棚卸し** し、
> **「現場負担減でメリット向上」「利便性向上」に効く既存機能のブラッシュアップ候補** を
> 根拠（ファイルパス・再利用できる既存部品）付きで優先度化する。
>
> 前提思想（`docs/field-workflow-roadmap.md`）: **現場に記録作業を増やさない**
> ——職人は作業に集中し、証明は Ledra が自動で残す。
>
> 本ドキュメントは提案書であり、実装は別途。

## 規模（実測 2026-07-15）

| 指標 | 値 | ソース |
|---|---|---|
| ページルート `page.tsx` | **295** | `find src/app -name page.tsx` 実測 |
| API ルート `route.ts` | **597** | `find src/app/api -name route.ts` 実測 |
| Cron（vercel.json 登録） | **27** | `vercel.json` 実測 |
| ポータル | 5（施工店 / 代理店 / 保険会社 / メーカー / 顧客）+ 外部API | FEATURES.md §1 |

> 注: FEATURES.md 記載の「570 route.ts / 25 cron」は前回更新時点の値。実測はやや増（597 / 27）。

---

## 1. 全機能 棚卸し（業務ドメイン軸で4等分）

FEATURES.md（権威文書, 1211行, §2〜§13）を業務ドメインで Q1〜Q4 に再配置した。各ドメインは
「機能 / パス / キーファイル」を代表列挙する（全 295 画面の逐条ではなく、ドメイン単位の網羅）。

### Q1 — 現場業務コア（施工記録・案件フロー）★現場負担の中心

| 機能 | パス | メモ / キーファイル |
|---|---|---|
| ダッシュボード（Admin/Storefront切替） | `/admin` | KPI ⇔ POSカンバンをワンタップ切替。`DashboardModeSwitch` |
| 承認インボックス | `/admin/inbox` | 証明書/発注/請求の未承認ドラフトをワンタップ承認 |
| 証明書 | `/admin/certificates`（`/new`,`/[public_id]`） | 発行・AI下書き・写真改ざん検知・施工前後写真ゲート。`CertNewFormWrapper.tsx` |
| 車両 | `/admin/vehicles`（`/new`,`/[id]`） | 車検証OCR・`ServiceTimeline`（履歴+証明書+予約+NFC 合成） |
| 顧客360° | `/admin/customers/[id]` | 車両/証明書/予約/請求を4タブ横断。顧客区分×支払サイクル |
| 案件ワークスペース | `/admin/jobs/[id]`,`/new` | 予約→来店→作業→証明書→請求を1画面。サインオフ・パイプライン `src/lib/signoff/state.ts` |
| 予約・稼働 | `/admin/reservations`,`/booking-settings`,`/mechanic-gantt`,`/booths`,`/staff` | 予約ライフサイクル・30分刻みガント・ブース割当 |
| 点検 | `/admin/inspections`,`/inspection-templates` | 車検満了180日以内一覧＋チェックリスト。`InspectionRecordForm.tsx` |
| 鈑金塗装 | `/admin/body-repair` | 引取→見積→工程→完成→納車、透明性ガイドライン同意フロー |
| 代車・タイヤ保管 | `/admin/loaner-cars`,`/tire-storage` | 貸出台帳（二重貸出DB制約）・季節タイヤ保管 |
| ワークフローテンプレ・スキャン | `/admin/workflow-templates`,`/scan` | 標準工程テンプレ・QR車両タグから作業パネル直行 |

### Q2 — 売上・経理

| 機能 | パス | メモ / キーファイル |
|---|---|---|
| 請求・帳票 | `/admin/invoices`,`/documents`,`/document-templates` | 合算請求・帳票デザイナー |
| POS会計 | `/admin/pos` | Stripe Terminal / Apple Tap to Pay / QR決済 |
| Square連携 | `/admin/square` | OAuth・売上同期・AI顧客紐付け |
| 会計連携 | `/admin/accounting` | freee / マネーフォワード OAuth、`accounting-sync` cron 日次3回 |
| 在庫・棚卸 | `/admin/inventory`,`/stocktake` | SKU在庫・低在庫フィルタ・棚卸セッション |
| 発注 | `/admin/purchase-orders`,`/parts-orders` | 下書き→承認→送信→入荷、部品発注 |
| 品目・見積 | `/admin/menu-items`,`/service-packages`,`/maintenance-packs`,`/quick-quote` | AI推奨価格・パッケージ・メンテチケット |
| 売掛・分析 | `/admin/payment-ledger`,`/management`,`/price-stats`,`/analytics/*` | 売掛元帳・経営KPI・担当者別分析 |
| 工賃自動算出 | 設定＋品目 | 標準工数×レバーレート `src/lib/pricing/labor.ts` |
| 請求・プラン | `/admin/billing` | Stripe サブスク（Free/Starter/Standard/Pro） |

### Q3 — 取引・他ポータル・運営

| 機能 | パス | メモ |
|---|---|---|
| 取引ハブ | `/admin/trades`,`/btob`,`/orders`,`/market-vehicles`,`/deals` | BtoBマーケット・受発注・商談 |
| 代理店 | `/admin/agent-hub`,`/agents`（+7運用画面） | お知らせ/キャンペーン/FAQ/請求/通知/サポート/研修 |
| 保険会社管理 | `/admin/insurers` | テナントアクセス権・契約管理 |
| メーカーポータル（第5） | `/manufacturer/*` | 認定施工店監視・品質チェック・ブランド保護 |
| Academy | `/admin/academy/*` | レッスン/事例/進捗/QA/フィードバック（Standard/Pro） |
| CRM・メッセージ | `/admin/messages`,`/line-broadcasts`,`/reviews`,`/customer-inquiries`,`/customer-intakes` | 統合メッセージ・LINE配信・AI感情解析 |
| 代理店ポータル | `/agent/*`（40 API） | 紹介・コミッション・レポート |
| 保険会社ポータル | `/insurer/*`（42 API） | 証明書検索・アンカー検証・BtoBマッチ・SLA |
| 運営 | `/admin/platform/*` | テナント統計・オンボーディングファネル・AI利用集計 |

### Q4 — 基盤・信頼・外部連携

| 機能 | パス / 場所 | メモ |
|---|---|---|
| AI業務自動化 | `/admin/settings/ai-automation`, `src/lib/ai/automation/*` | 40+タスク、フィールド単位ポリシー（auto/suggest/manual） |
| 電子署名フロー | `/sign/*`,`/parts/confirm/*`,`/agent-sign/*` | 受領サイン・部品確認・代理店契約（トークンベース） |
| 部品インテグリティ | `/admin/parts-integrity`, `api/parts/*` | 顧客署名＋サーバ署名＋RFC3161 TSA＋Polygonアンカー |
| ブロックチェーン | `/admin/polygon-backfill`, `polygon-signer` cron | 施工写真ハッシュを Polygon にアンカリング |
| 車両パスポート・外部API | `/passport/*`, `api/v1/*` | 中古車店向け有料レポート・Ingest・accident-match |
| 供給チェーン | `api/admin/supply/*`, `webhooks/supply/*` | 部品自動発注（金額上限を安全の核に） |
| モバイル・PWA | `api/mobile/*`（25）, `public/sw.js`, `src/lib/outbox/*` | オフライン書込アウトボックス＋Background Sync |
| Webhook・Cron | `api/webhooks/*`（6）, `api/cron/*`（27） | Stripe/Square/LINE/Resend、25+定期処理 |
| セキュリティ | `/admin/settings/security` | 2FA(TOTP)・SSOスカフォールド・監査ログ |

### 棚卸しで検出：FEATURES.md に散文の無い実在ルート（要監査）

散文説明が FEATURES.md に無いが実在するルート。次回の逐条監査で確認対象:
`/admin/field-knowledge`, `/admin/next-touch`, `/admin/scan`, `/admin/notification-logs`,
`/admin/settings/{features,addons,follow-up,line-knowledge}`,
`agent/{products,integration,supply/orders}`, `cron/{daily-digest,vehicle-capture-prompt}`。
プロトタイプ/デモ（本番不要なら削除候補）: `admin-prototype`, `motion-demo`, `probe`。

---

## 2. ブラッシュアップ提案（優先度付き）

方針: **既存機能・既存部品の再利用で小差分**にできるものを上位に。各提案に「効き所 / 根拠 / 再利用先」。

### ◎ 最優先（小差分・高レバレッジ・現場負担減）

#### 提案1. 点検フォーム `InspectionRecordForm` の格上げ ★イチオシ

証明書フォームは音声メモ・AI下書き・Storage写真パイプライン・オフライン対応まで揃っているのに、
**点検フォームだけが取り残されている**。同じ現場入力なのに体験が別物になっている。

現状の問題（`src/components/admin/InspectionRecordForm.tsx` 実読で確認済み）:

| # | 問題 | 該当行 | 影響 |
|---|---|---|---|
| a | 写真を **base64 data URL のまま `photo_urls` にインライン保存**（Storage不使用） | `:24-27, 126-132, 162, 362-369` | レコード肥大化・注釈/EXIF/改ざん検知パイプラインから乖離 |
| b | `<input accept="image/*">` に **`capture="environment"` が無い** | `:302-311` | モバイルで背面カメラに直行しない。証明書フォームと不一致 |
| c | **音声メモ/AI補助が無い** | 全体 | 証明書フォームには `VoiceMemoPanel`/`AiDraftPanel` 有り |
| d | テンプレを **全件取得してから ID で絞り込み** | `:85-88` | 無駄なラウンドトリップ |

提案（すべて既存部品の流用で完結）:
- (a) `PhotoUploadSection.tsx` の Storage アップロード＋`imageMarkup` 注釈パターンに置換
- (b) 撮影用途の file input に `capture="environment"` を付与
- (c) `VoiceMemoPanel.tsx` を点検所見（`notes`）入力に流用
- (d) テンプレ取得を単一ID取得に（新規APIが要る場合のみ最小追加）

再利用先: `src/app/admin/certificates/new/PhotoUploadSection.tsx`,
`src/app/admin/certificates/new/VoiceMemoPanel.tsx`, `src/components/imageMarkup/*`,
`src/lib/certificateImages/processUploadedPhoto.ts`。

効き所: **現場負担減（撮影ワンタップ・音声で所見）＋データ品質（Storage/注釈/EXIF統一）**。
差分規模: **小**（既存パターンの移植が主）。

#### 提案2. 膜厚計データ取込（`FilmThicknessSection`）

現状: パネルごとに施工前後 μm を全て手打ち（`src/app/admin/certificates/new/FilmThicknessSection.tsx`）。
外部 sync `/api/external/nexptg/sync` は存在するが、証明書フォーム内は手入力のみ。

提案（最小差分順）:
- (a) 膜厚計表示の**写真OCR取込**（AI/OCR基盤 `src/lib/ocr/` を流用）
- (b) CSV 取込
- Bluetooth 直結は差分大のため後回し

効き所: 現場の手打ち・転記ミス削減。差分規模: **中**（OCRプロンプト＋取込UI）。

#### 提案3. カメラ直行の横断統一（`capture` 属性監査）

全 `type="file"` 画像入力を棚卸しし、現場撮影用途は `capture="environment"` に統一。
証明書フォーム（`PhotoUploadSection`）は対応済み。点検（提案1-b）や他フォームを同基準へ。

効き所: 全撮影導線の体験を揃える利便性向上。差分規模: **小**（属性追加中心、要一覧監査）。

### ○ 中期（利便性向上・ロードマップ整合、差分中〜大）

#### 提案4. 証明書フォームのモバイル体験改善

`CertNewFormWrapper.tsx`（954行）は長スクロール、発行直前の写真/品質ゲートが後出しで、
モバイルで作業末端に止まる。ゲート要件の早期表示＋モバイルステッパー/セクション折り畳みで緩和。
差分規模: **中〜大**（既存フォームの大改修）。

#### 提案5. データ間クロスリンク強化（FEATURES §12.2 記載済）

- 請求書 → 「元の案件を見る」（案件ID逆引き）
- 証明書 → 「同一車両の過去施工タイムライン」（車両側 `ServiceTimeline` を埋込）

効き所: 少ないクリックでタスク完了。差分規模: **小〜中**。

#### 提案6. Cmd+K 自然言語化 / 「次のアクション」AI提案（FEATURES §12.2）

既存 `CommandPalette`・`TodayTasksWidget` を LLM に接続。「山田さんの先月の証明書」→ フィルタ済み
結果へ直行、優先順位付き次手を能動提案。差分規模: **大**（提案止まり）。

### △ 既知ギャップ（`pdca-ideals-gap-2026-07.md` 由来、参考）

- 提案7. 在庫水位連動の**自動再発注**（発注点結線）— B2B受発注・供給ポータルは有、reorder point 未結線（P2）
- 提案8. 中古車買取の**相場ベース査定エンジン**— パスポート履歴は有、定量化未実装（P3）

---

## 3. まとめ表（ドメイン × 提案 × 優先度 × 差分規模）

| # | 提案 | ドメイン | 優先度 | 差分規模 | 主効果 |
|---|---|---|---|---|---|
| 1 | 点検フォーム格上げ（Storage写真/カメラ直行/音声AI/テンプレ取得） | Q1 | ◎ | 小 | 現場負担減＋データ品質 |
| 2 | 膜厚計データ取込（写真OCR/CSV） | Q1 | ◎ | 中 | 手打ち・転記ミス削減 |
| 3 | カメラ直行の横断統一（`capture`監査） | Q1/横断 | ◎ | 小 | 撮影導線の利便性統一 |
| 4 | 証明書フォームのモバイル体験改善 | Q1 | ○ | 中〜大 | モバイル入力負担減 |
| 5 | データ間クロスリンク強化 | Q1/Q2 | ○ | 小〜中 | クリック数削減 |
| 6 | Cmd+K自然言語化 / 次アクションAI提案 | 横断 | ○ | 大 | パワーユーザー利便性 |
| 7 | 在庫連動 自動再発注 | Q2 | △ | 中 | 経理・調達自動化 |
| 8 | 買取査定エンジン | Q3/Q4 | △ | 大 | 新規収益 |

**推奨着手順**: 提案1 →（提案3 と同時に処理可）→ 提案2 → 提案5。いずれも既存資産の再利用で
現場負担・利便性に直接効き、差分が小さい。提案4・6・7・8 はロードマップ項目として別サイクル。

---

## 付記

- 数値・件数は実測（`find`/`vercel.json`）または FEATURES.md 突合値のみを採用。不明値は本文で明示。
- 本棚卸しは**ドメイン単位の網羅**であり、全295画面の逐条監査ではない。散文欠落ルート群（§1末尾）は
  次サイクルの逐条監査対象として残す。
