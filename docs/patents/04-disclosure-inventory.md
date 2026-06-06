# 公開状況の棚卸し（特許・新規性チェック用）

> 作成: 2026-05-31 / 目的: **どの技術がどこまで対外公開済みか**を確定し、
> 各発明（[01](./01-vehicle-passport-meta-anchor.md)/[02](./02-photo-tampering-cascade.md)/[03](./03-ai-automation-guardrails.md)）の出願余地（新規性）を判断する材料にする。
>
> ⚠️ これはエンジニアによる事実整理です。「公開＝新規性喪失か」の最終判断は弁理士へ。
> 特に `robots: noindex` ページの扱い（後述）は専門家確認が必要です。

---

## 0. 結論（ヘッドライン）

| 発明 | 中核機構の公開状況 | 出願余地 | 緊急度 |
|---|---|---|---|
| **06 ZKP 選択的開示**（追補 2026-06-05） | 機構（選択的開示・コミットメント・nonce 設計）は**完全未公開**（grep 0 件）。保険会社向け検証 API は認証の背後 | **広い独立項の余地あり（自社開示ハンデなし）** | **高（最有力・最優先で出願検討）** |
| **07 確定ゲート（部品インテグリティ）**（追補 2026-06-05） | 機構（DB 強制確定・連絡先格下げ・横断シリアル照合）は**完全未公開**。設計書・実装とも社内のみ | **余地あり（組み合わせを進歩性の中心に）** | 高 |
| **01 メタアンカー** | **機構（集約ダイジェスト＝単一Tx）は未公開**。ただし「VIN横断で施工履歴を集約」という**上位コンセプトは 2026-05-04 から公開済み**（`/features/timeline` 他、インデックス対象） | **機構に限れば余地あり**。コンセプト級の広い請求項は自社開示で潰れている可能性大 | **高（要・請求項の絞り込み）** |
| **02 改ざん検出カスケード** | アルゴリズム（EXIF三分類＋灰のみVision）は**未公開**。「改ざん検知あり／C2PA／SHA-256」は公開済み | 方法に限れば余地あり | 中 |
| **03 AI自動化ガードレール** | 機構（確信度降格＋不可侵制約＋費用遮断）は**未公開**。「自動入力／自動化」一般は公開済み | 方法に限れば余地あり | 中 |

**最重要**：発明01は「複数施工店をまたいでVINで集約する」という**コンセプト自体が既に公開**されている。よって独立請求項は **メタアンカー機構（順序非依存の集約ダイジェストを単一トランザクションで記録し、第三者がその集約値をサーバ非依存で再計算・照合できる点）** に寄せる必要がある。幸い、この機構の具体は公開面に一切出ていない。

---

## 1. 既に対外公開済み（＝新規性に影響しうる）

「面」列：`features/*` と `blog`・`for-shops` 等は **robots.ts で許可＝検索インデックス対象の完全公開**。`/poc` は **noindex（後述§3）**。初出日は git の初コミット日（対外公開日の目安。実デプロイ日が真の基準）。

| # | 公開された技術内容 | 主な公開面（ファイル:行） | 種別 | 初出 |
|---|---|---|---|---|
| D1 | **施工写真の SHA-256 を Polygon にアンカー**（改ざん検知） | `features/blockchain-anchoring/page.tsx:44-46,66`、`content/blog/2026-04-18-polygon-anchoring.mdx:30,53`、`poc/page.tsx:169-176` | 完全公開＋blog | 2026-05-04 |
| D2 | **C2PA 写真署名**（撮影デバイス・日時・編集履歴） | `for-shops/page.tsx:449`、`poc/page.tsx:81,169` | 完全公開 | 2026-05-04 |
| D3 | **証明書単位の第三者独立検証**（Ledra非依存でハッシュ照合） | `features/blockchain-anchoring/page.tsx:15,110,241`、`features/insurer-portal/page.tsx:67-69,216` | 完全公開 | 2026-05-04 |
| D4 | **PIIをチェーンに載せない／ハッシュのみ・復元不可**（実質クリプトシュレッディング） | `features/blockchain-anchoring/page.tsx:90,227` | 完全公開 | 2026-05-04 |
| D5 | **VIN（車台番号）をキーに複数施工店の施工履歴を横断集約**（＝発明01の上位コンセプト） | `features/timeline/page.tsx:110,130-132,375`、`poc/page.tsx:93,133,180,259` | **完全公開（timeline）＋noindex（poc）** | 2026-05-04 |
| D6 | **車両デジタルパスポート `/v/[VIN]` の概念**（一台の全履歴を一画面／NFC着地点） | `features/nfc/page.tsx:65,79,130-195`、`features/timeline/page.tsx:14`、`poc/page.tsx:196-269` | 完全公開＋noindex(poc) | 2026-05-04 |
| D7 | **車検証OCRでVIN等を自動入力**（手入力ゼロ） | `features/vehicle-ocr/page.tsx:42-60,109` | 完全公開 | 2026-05-04 |
| D8 | **自動入力・決済自動化など「自動化」一般**（AIガードレール機構は含まず） | `for-shops/page.tsx:246`、`for-btob/page.tsx:72-181` | 完全公開 | 2026-05-04 |

→ **D1〜D6 は、それ単体（コンセプト級）では Ledra 自身の開示により新規性を主張しにくい。** 各発明はこの「公開済みコンセプトの**さらに内側の具体機構**」に請求項を寄せる必要がある。

---

## 2. 未公開（＝出願余地が残っている中核機構）

公開面（`src/app/(marketing)`・`src/content`・`public`）を全文検索しても**出現しなかった**項目。これらが各発明の「生きている新規性」。

| # | 未公開の中核機構 | 実装（非公開） | 対応発明 |
|---|---|---|---|
| U1 | **メタアンカー**：全 tx_hash を小文字化・重複排除・昇順ソートして VIN と連結 → SHA-256 → **単一Txで記録**。集合不変なら再記録しない（冪等） | `src/lib/passport/metaAnchor.ts#computeMetaAnchorHash` / `recomputeAndMaybeAnchor` | **01** |
| U2 | **集約値のサーバ非依存・第三者再計算検証**（証明書単位ではなく**VIN全体の集約値**を公開データから再構成して照合） | `src/lib/passport/api/verify.ts`（`meta_anchor.hash` ＋ 構成 tx 集合） | **01** |
| U3 | **改ざん検出の三分類＋両側スキップ**（白/黒/灰、灰のみ高価モデル、決定的指標はモデル省略） | `src/lib/ai/photoTamperingCheck.ts`（`DECISIVE_TAMPERING_FLAGS`/`visionTargets`） | **02** |
| U4 | **画像間の時刻整合・集合内ハッシュ重複という集合レベル一次指標** | 同上 `detectExifFlags` | **02** |
| U5 | **AI自動化の単一解決経路**：確信度降格＋不可侵制約（壁3）＋費用サーキットブレーカー | `src/lib/ai/automation/policy.ts` / `costCap.ts` | **03** |
| U6 | **非対称 failure semantics**（安全制約=フェイルクローズ／費用遮断=フェイルオープン） | `policy.ts#withCostCap` ほか | **03** |
| U7 | **ZKP 選択的開示**：開示/非開示/粗粒度を混在させた Merkle 木、シークレット依存 nonce、ルートのみ台帳記録、保険会社がサーバ非依存で属性検証（PII/シリアル/価格/VIN を渡さない） | `src/lib/zkp/`（commitment/merkleTree/verifier）、`src/app/api/insurer/zkp/verify` | **06** |
| U8 | **本人所持証明に束ねた DB 強制確定**：電話フルハッシュ一致＋署名＋保証グレードを `BEFORE UPDATE` トリガで強制（service-role も例外なし）／連絡先出所による格下げ／横断シリアル照合（生値非開示）／相互矛盾検知 | `parts/`（confirmationPolicy/phoneIdentity/partSigning）、`...part_installations_guard.sql` | **07** |

検索コマンド（再現用）:
```bash
grep -rniE "メタアンカー|集約.{0,3}(ハッシュ|ダイジェスト)|meta.?anchor" \
  "src/app/(marketing)" src/content public   # → 0 件（未公開を確認）

# 06/07 の未公開確認（2026-06-05 実施・いずれも 0 件）
grep -rniE "ゼロ知識|zero.?knowledge|選択的開示|selective.disclosure|zkp|コミットメント" \
  "src/app/(marketing)" src/content public   # → クレーム機構は 0 件（"コミットメント" は PoC の非暗号用法のみ）
grep -rniE "部品装着|すり替え|RFC ?3161|タイムスタンプ局|装着確定|part.?installation" \
  "src/app/(marketing)" src/content public   # → 0 件（未公開を確認）
```

---

## 3. ⚠️ `/poc` ページの扱い（弁理士確認事項）

`/poc/page.tsx` は `robots: { index: false, follow: false }`（**noindex**）だが、**認証ゲートも `PASSPORT_PUBLIC_ENABLED` ゲートも無く、URL を知る誰でも閲覧できる**。タイトルは「Ledra × Toyota PoC」で、**トヨタ等へ共有される想定の資料**。

- noindex は「検索エンジンに載せない」だけで、**公衆が閲覧可能であることは変わらない**。特許実務上、URL アクセス可能＋第三者（トヨタ）への提示は「公然知られた／公然実施」に当たり得る。
- ここで D5（VIN横断集約）・D6（パスポート概念）が**具体的なステップ付きで開示**されている（poc:169-180 の4ステップ）。
- ただし poc:170-176 で開示しているのは **per-image SHA-256 → Polygon** までで、**メタアンカー（U1）は開示していない**。

**確認事項**：(a) `/poc` の公開・配布が新規性喪失に当たるか、(b) 当たる場合の初日（デプロイ日／トヨタ提示日）。新規性喪失の例外（特許法30条）適用の要否・期限算定に直結する。

---

## 4. 一方、確実に未公開なもの（ゲート確認済み）

| 対象 | ゲート | 状態 |
|---|---|---|
| `/v/[vin]` 公開パスポートページ | robots disallow ＋ `PASSPORT_PUBLIC_ENABLED!=true` で `notFound()` | **未公開** |
| `/api/v1/passport/*`（verify 等） | 同上で `apiNotFound` | **未公開** |
| `/passport/transfer/[token]` 受諾ページ | 同上 | **未公開** |
| AI自動化の設定UI・内部アルゴリズム | admin ログイン背後 | **実質未公開**（UI挙動は契約テナントに可視） |
| 改ざん検出アルゴリズム | サーバ内部のみ | **未公開** |

（出典：`docs/vehicle-passport-design.md §8`、`src/lib/passport/featureGate.ts`、`src/app/api/v1/passport/verify/route.ts`）

---

## 5. 推奨アクション

1. **【最優先・01】請求項をメタアンカー機構（U1+U2）に絞る。** 「VIN横断集約」コンセプト（D5）は自社開示済みのため独立項の中心にしない。独立項は「**集合を順序非依存ダイジェスト化し単一Txで記録 → 第三者が集約値を公開データから再計算して照合**」に置く。→ [doc 01 §6/§9 に追記済み]
2. **【01】`/poc` と `/features/timeline` の公開実態を弁理士に開示**し、(i) どこまでが新規性喪失か、(ii) 30条例外の要否・期限を確定。`PASSPORT_PUBLIC_ENABLED=true` 化・HP更新・プレスの**前**に出願戦略を固める。
3. **【02・03】対外資料でアルゴリズムを語らない。** U3〜U6 は現状未公開なので、出願までブログ・PoC資料・登壇等で機構の詳細（三分類／確信度降格／費用遮断／非対称failure）を出さない。
4. **【共通】公開面の変更を監視。** 新しい `features/*` ページや blog で U1〜U6 に触れる前に必ず本表を更新し、弁理士に確認する。

---

## 付録：判定に使った主な根拠

- `src/app/robots.ts` — `/features` は許可（インデックス対象）、`/v/`・`/api/`・`/admin/` 等は disallow
- `src/app/(marketing)/poc/page.tsx:11` — `robots: { index: false, follow: false }`（noindex だが閲覧可）
- `src/app/(marketing)/features/timeline/page.tsx:110,130-132` — 車台番号マッチングで複数施工店の履歴を自動マージ（D5）
- `src/app/(marketing)/features/blockchain-anchoring/page.tsx:90,227` — チェーンにはハッシュのみ（D4）
- 公開面全文検索で「メタアンカー／集約ダイジェスト」は 0 件（U1 未公開）
- git 初コミット日：上記公開ページはいずれも 2026-05-04
</content>
