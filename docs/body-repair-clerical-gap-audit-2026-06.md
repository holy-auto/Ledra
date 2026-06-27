# 鈑金塗装業 事務作業ギャップ監査レポート (2026-06)

> 作成日: 2026-06-27
> 目的: 鈑金塗装店の「1日の業務」を工程順に辿り、**事務作業のうち Ledra が
> まだ肩代わりできていない断絶点**をコード根拠付きで特定する。
> 上位方針: 「技術職を技術に集中させ、事務は可能な限り Ledra で代替する」。
> 関連: `docs/body-repair-transparency-compliance.md` /
> `docs/feature-roi-board.md` / `docs/ledra-goals-strategy-2026-05.md`

---

## 0. エグゼクティブサマリ

鈑金塗装は 5 業種のなかで**最も事務負荷が重く**(保険会社との往復・工程管理・
代車・納期)、かつ Ledra の差別化(改ざん不能な記録 × 保険ネットワーク)が
最も活きる業種である。

監査の結論は明確で、Ledra の鈑金対応は **「記録・透明性のバックエンドは
業界水準以上に完成しているが、現場が日々触る『連結とラストワンマイル UI』が
断絶している」** という一点に集約される。新機能を横に増やすのではなく、
**既にあるエンジン同士を繋ぐ**だけで事務負荷の大半が消える状態にある。

事務負荷が集中する断絶点は次の 3 つ + 1 横断:

| # | 断絶点 | 現場で起きていること | 解消の重さ |
|---|---|---|---|
| **A** | 保険会社との往復 | 見積提出・承認待ち・支払指示を手作業で追跡 | 中〜大 |
| **B** | 納期・進捗の顧客通知 | `due_date` が無く、進捗通知は URL 手動コピペ | 小〜中 |
| **C** | 作業記録の手入力 | 音声入力は証明書画面のみ。案件側は手打ち | 小 |
| **横断** | 工程ボードのリアルタイム性 | 稼働ガントは SSR 一発描画で自動更新されない | 小 |

A/B/C/横断はいずれも**バックエンド・データモデルが 7〜9 割存在**しており、
追加コードはそれぞれ概ね 100〜300 行規模。詳細は §5〜§6。

---

## 1. 監査の前提・方法

- 対象: `tenant`(施工店)側のフロント事務・板金工・塗装工の業務。
- 手法: 鈑金塗装店の標準的な 1 日の業務フローを工程順に分解し、各工程で
  「Ledra に既存機能があるか」「人の手作業がどこで発生するか」をコードと
  マイグレーションを根拠に判定。
- 根拠ファイルは各節に明記(行番号はリポジトリ 2026-06-27 時点)。

---

## 2. 鈑金塗装店の「1日の業務」フロー

```
朝礼/工程確認 ─▶ 入庫受付 ─▶ 損傷確認・写真 ─▶ 見積(協定) ─▶ 保険会社へ提出
     │                                                              │
     ▼                                                       (承認待ち=滞留)
 代車手配 ◀───────────────────────────────────────────────────────┘
     │
     ▼
 分解 ─▶ 板金 ─▶ 塗装 ─▶ 組付 ─▶ 完成検査 ─▶ 納車(電子受領) ─▶ 請求(保険/自費分割)
                                                                   │
                                                                   ▼
                                                        保険金請求・入金消込
```

フロント事務は終日、**「①保険会社はどこまで承認した?」「②あの車の納期は?
代車はいつ返る?」「③作業内容を記録に起こす」**の 3 つに時間を奪われる。
以下、工程ごとに Ledra の対応状況を見る。

---

## 3. 工程別ギャップ表

| 工程 | 対応 | 実装の中身 / 断絶点 | 主な根拠 |
|---|---|---|---|
| 入庫受付 | ✅ | `body_repair_jobs.intake_at` 自動記録、Kanban ステージ管理 | `20260612000009_body_repair_workflow.sql` |
| 損傷写真(3段階) | ✅ | `certificate_images.stage`(intake_before/in_progress/after) + EXIF 撮影時刻 + 改ざんアンカリング | `20260620000000_body_repair_transparency.sql` |
| 見積(協定) | ✅ | AI 見積 `quoteFromVehicle.ts`、`documents(doc_type=estimate)`、予定/実績 `planned_work_json`/`actual_work_json` | `src/lib/ai/quoteFromVehicle.ts` |
| **保険会社へ提出** | ⚠️ **断絶A** | 見積は作れるが**保険会社への提出・承認待ち追跡が無い**。`insurer_cases` は保険会社→施工店の閲覧主体で、施工店→保険会社の往復が手作業 | `src/app/api/insurer/cases/route.ts` |
| 代車手配 | ⚠️ | `loaner_cars` テーブル・`/admin/loaner-cars` はあるが**案件と未連携**(FK なし)。「この車の代車はいつ返る?」が照合できない | `20260612000016_loaner_cars.sql` |
| 入庫〜板金〜塗装〜完成 | ✅ | ステージ遷移 + 各 `*_start_at` 自動タイムスタンプ(上書き不可で正確な履歴) | `body_repair_workflow.sql` |
| 作業前/変更同意 | ✅ | `body_repair_consents` + ECDSA 署名 + Polygon アンカー | `body_repair_transparency.sql` L106-166 |
| **進捗の顧客通知** | ⚠️ **断絶B** | `track_token` で `/track/[token]` 公開ページはあるが**URL を手動共有**。ステージ遷移時の自動通知なし | `src/app/track/[token]/page.tsx` |
| **納期管理** | ❌ **断絶B** | `body_repair_jobs` に **`due_date` カラムが無い**(`delivered_at` 実績のみ)。完成予定日・遅延警告が無い | `body_repair_workflow.sql:36` |
| **作業記録入力** | ⚠️ **断絶C** | 音声→記録は**証明書作成画面のみ**実装。案件(`reservations`/`body_repair_jobs`)側に音声入力 UI が無く手打ち | `src/app/admin/certificates/new/VoiceMemoPanel.tsx` |
| 完成検査 | ⚠️ | 画像記録はあるが品質スコアの傾向分析・スタッフ別評価は薄い | `photoQualityAuto` |
| 納車(受領) | ✅ | `delivery_receipts` 電子署名 | — |
| 請求(分割) | ✅ | `documents(invoice)` + `billing_splits`(保険/自費分割) | `billing_splits` |
| 保険金請求・消込 | ⚠️ **断絶A** | `claim_number` の記録は手入力。保険会社の支払可否指示を受け取るスキーマ・会話録なし | `billing_splits.claim_number` |
| 工程ボード(横断) | ⚠️ **横断** | `mechanic-gantt` は完成だが SSR 一発描画で**リアルタイム更新が無い** | `src/app/admin/mechanic-gantt/page.tsx` |

凡例: ✅ 実装済 / ⚠️ 部分(断絶あり) / ❌ 未実装

---

## 4. 事務負荷が集中する断絶点 — 深掘り

### 断絶A: 保険会社との往復(提出→承認待ち→支払指示の記録)

**現場**: 複数案件が並行する繁忙期、フロント事務は「あの案件、保険承認は
どこまで?」の照会と転記に終日追われる。承認が滞ると代車費用と工期遅延が
積み上がる。

**現状コード**:
- `insurer_cases`(`src/app/api/insurer/cases/route.ts`)は**保険会社ユーザーが
  施工店の証明書・案件を閲覧・スコアリングする向き**。AI 不正スコア/サマリ/
  自動アサインまで保険会社側は充実している。
- 一方、**施工店→保険会社**の方向、すなわち
  - 見積書(`documents.doc_type='estimate'`)の保険会社への提出・通知
  - 「保険承認待ち」ステータスと案件の連動
  - 承認額の確定・上限枠との照合
  - 支払可否指示の受領記録・差し戻し会話録
  が**いずれもスキーマ/フローとして存在しない**(`insurer_cases.meta` の任意
  JSON に手で書く程度)。

**断絶の本質**: 保険ネットワークの「片側(保険会社の閲覧)」しか繋がっておらず、
施工店フロントの最大の事務(往復追跡)が空白。ここは Ledra の中核差別化
(双方向ネットワーク)に直結する。

### 断絶B: 納期・工程進捗の顧客通知

**現場**: 「完成は木曜予定です」と口頭約束 → 工程が遅れても自動追跡なし。
進捗は `/track/[token]` を**手動でコピペ送信**。遅延判断も目視。

**現状コード**:
- 進捗の素材は完成済み: `track_token`(`20260621000000_body_repair_tracking.sql`)、
  顧客ページ `src/app/track/[token]/page.tsx`、各ステージの自動タイムスタンプ。
- **欠落**: ①`body_repair_jobs` に `due_date`(完成予定日)カラムが無い、
  ②ステージ遷移時の LINE/メール自動通知が無い(通知基盤 `sendEmail`/LINE
  クライアントは既存)、③遅延警告ロジックが無い。

**断絶の本質**: 「通知を送る部品」も「顧客が見るページ」も既にあるのに、
**遷移イベント→通知のトリガー線**と**納期という 1 カラム**が無いだけ。

### 断絶C: 作業記録の手入力(音声入力の横展開)

**現場**: 板金工・塗装工が手を止めてキーボードで作業内容を入力。

**現状コード(重要な発見)**:
- 音声→記録は**既に動いている**。`VoiceMemoPanel.tsx`(Web Speech API・
  日本語 `ja-JP`・リアルタイム認識)→ `POST /api/admin/certificates/voice-memo`
  → `reformatVoiceMemo()`(Haiku で title/description/cautions に整形)→
  証明書の `content_free_text` に自動投入。**証明書作成画面では 100% 完成**。
- `fieldCatalog.ts` は `voice_memo` ソースが `job.notes` も対象だと**宣言済み**
  なのに、案件側の実装(UI・保存導線)が無い。モバイル(`apps/mobile`)にも
  音声入力コンポーネントが 0 個。

**断絶の本質**: エンジン(整形 API・UI 部品・フィールド定義)は揃っており、
**案件フォームへ同じパネルを載せ、`reservations`/`body_repair_jobs` の
メモへ保存する導線**を足すだけ。

### 横断: 工程ボードのリアルタイム性

**現状コード**: `mechanic-gantt` は `buildGanttData()`・`GanttBoard.tsx`・
ステップ進行 API(`reservations/[id]/advance`、ステップログ + LINE 通知付き)
まで完成。**唯一の欠落はリアルタイム更新**で、SSR で当日分を 1 回描画した後は
手動リロードが要る(Supabase Realtime / SWR polling いずれも未実装)。

**断絶の本質**: 「今この車がどの工程か」を全員が見守る運用ディスプレイに
するための**自動再取得**が無いだけ。

---

## 5. 「あと一歩」の既存資産(low-hanging fruit)

監査で確認した、**少量の追加で価値が立つ既存資産**:

| 資産 | 場所 | あと一歩 |
|---|---|---|
| 音声整形エンジン | `src/lib/ai/voiceMemoReformat.ts` / `.../certificates/voice-memo/route.ts` | 案件フォームへパネル移植 + `job.notes` 保存(~100行) |
| 工程ガント | `src/lib/gantt/board.ts` / `components/admin/gantt/GanttBoard.tsx` | `/api/admin/gantt` + SWR ラッパで live 化(~110行) |
| 顧客進捗ページ | `src/app/track/[token]/page.tsx` + 自動タイムスタンプ | ステージ遷移→LINE/メール自動通知の結線 |
| 代車管理 | `src/app/admin/loaner-cars/` + `loaner_cars` | `body_repair_jobs` との FK + 返却照合 |
| 保険分割請求 | `billing_splits` | 保険会社提出・承認待ちステータスの上載せ |

---

## 6. 優先度付きロードマップ

### 短期(各 1〜2 週間・~100〜200行)

1. **音声入力を案件側へ横展開(断絶C)**
   `VoiceMemoPanel` を `fieldName` props 化して汎用部品にし、案件フォームに
   配置。`job.notes`/`body_repair_jobs` メモへ保存。全業種に即効。
2. **工程ボードの live 化(横断)**
   `/api/admin/gantt?date=` を新設し、`GanttBoardLive`(SWR `refreshInterval`)
   で wrap。新規テーブル不要。
3. **`due_date` カラム + 遅延警告(断絶B 前半)**
   `body_repair_jobs.due_date` を追加(nullable→運用)。一覧で超過ハイライト。
4. **代車↔案件の連携(断絶B 関連)**
   `loaner_cars` に `body_repair_job_id` FK、返却照合クエリ。

### 中期(各 ~1 ヶ月)

5. **ステージ遷移→顧客自動通知(断絶B 後半)**
   既存の遷移イベント(`advance` route)にフックし、`sendEmail`/LINE で
   「本日 ○○ 工程に進みました/完成予定日は ○○」を自動送信。
6. **保険会社への見積提出 + 承認待ちワークフロー(断絶A 中核)**
   `body_repair_jobs` ↔ `insurer_cases` の双方向リンク、提出ステータス、
   承認額照合、支払可否指示の記録スキーマ。
7. **音声入力のモバイル対応**
   `apps/mobile` に録音 UI + 文字起こし(Web Speech API 不可のため Whisper 等
   の transcription API 選定が必要)。

### 長期(各 2〜3 ヶ月)

8. **鈑金固有の単価体系**(指数・レバーレート・コマ単価)を `menu_items` に統合。
9. **特定整備該当判定の AI 支援**(修理内容→該当判定/チェックリスト化)。
10. **保険会社との書類往復自動化**(指定フォーマット変換 / FAX→OCR→記録)。

---

## 7. 付録: 関連ファイル索引

- 鈑金ワークフロー: `supabase/migrations/20260612000009_body_repair_workflow.sql`
- 透明性ガイドライン: `supabase/migrations/20260620000000_body_repair_transparency.sql` /
  `docs/body-repair-transparency-compliance.md`
- 顧客トラッキング: `supabase/migrations/20260621000000_body_repair_tracking.sql` /
  `src/app/track/[token]/page.tsx`
- 代車: `supabase/migrations/20260612000016_loaner_cars.sql` /
  `src/app/admin/loaner-cars/`
- 保険案件: `src/app/api/insurer/cases/route.ts`
- 音声記録: `src/app/admin/certificates/new/VoiceMemoPanel.tsx` /
  `src/lib/ai/voiceMemoReformat.ts` /
  `src/app/api/admin/certificates/voice-memo/route.ts` /
  `src/lib/ai/automation/fieldCatalog.ts`
- 工程ガント: `src/lib/gantt/board.ts` /
  `src/components/admin/gantt/GanttBoard.tsx` /
  `src/app/admin/mechanic-gantt/page.tsx` /
  `src/app/api/admin/reservations/[id]/advance/route.ts`

---

> 本レポートは現状コードの読み取り監査であり、実装は含まない。
> 着手時は短期項目から、既存資産の再利用を優先する。
