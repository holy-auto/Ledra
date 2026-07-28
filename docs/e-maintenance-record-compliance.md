# 点検整備記録簿等の電磁的取扱い 準拠マッピング

出典: 国土交通省
「**点検整備記録簿、特定整備記録簿及び指定整備記録簿の電磁的方法による作成、
保存又は交付に関する取扱い**」（令和7年7月8日周知）

本書は、同取扱いの「第２ 自動車特定整備事業者又は指定自動車整備事業者の遵守事項等」
に対する Ledra の実装状況を、根拠（テーブル / API / UI / マイグレーション）とともに
対応付けるものである。既存の
[`docs/body-repair-transparency-compliance.md`](./body-repair-transparency-compliance.md)
（令和6年3月「透明性確保ガイドライン」マッピング）の姉妹資料であり、そちらが
「何を記録・保存・説明するか」を扱うのに対し、本書は「その電磁的記録を**どう作成・保存・
交付し、システムをどう安全に運用するか**」を扱う。

## 凡例と前提

- ✅ **対応** — システムで満たしている（根拠あり）
- ⚠️ **部分対応** — 一部は満たすが差分・要確認あり
- ❌ **未対応 / 該当なし** — 実装が確認できない、またはギャップ
- 🏢 **事業者運用で担保** — システム要件ではなく事業者の規程・運用で満たす項目（Ledra は支援にとどまる）

> **マーカーはコード上のエビデンス（本書末尾の commit 時点）に基づく。** 「要確認」は、
> コードを開いても実装有無を断定できなかった項目であり、推測で ✅ を付けていない。
> **スコープ**: Ledra は自動車特定整備事業者・指定自動車整備事業者向けの SaaS のため、
> 本取扱い「第２（事業者の遵守事項）」を主対象とする。「第３（自動車の使用者）」は主対象外だが、
> 第２ ４（写しの交付）の交付先＝使用者として関連する。

---

## 第２ １．点検整備記録簿等の作成・保存の遵守事項（施行規則）

### （１）電磁的記録による作成（施行規則第６条） — ✅ 対応

| 規制要求 | 実装 |
| --- | --- |
| 書面の作成に代え、電子媒体のファイル又は電磁的記録媒体をもって調製して作成 | 整備記録・帳票・証明書はすべて電磁的記録として作成。`documents`（帳票 / `supabase/migrations/20260314000000_documents.sql`）、`certificates`（施工・整備記録本体 / `20260313020000_core_tables.sql:75`）、`inspection_records`（デジタル点検表 / `20260612000018_inspection_checklists.sql`）、`body_repair_jobs`（車体整備＝特定整備該当 / `20260620000000_body_repair_transparency.sql`）。保存先は Supabase（Postgres + Storage）。 |

### （２）電磁的記録による保存（施行規則第４条） — ✅ 対応（方式①）

| 規制要求 | 実装 |
| --- | --- |
| ① 作成したファイルにより保存 | 電子的に作成した記録をそのまま Supabase に保存（方式①）。証明書PDF・画像は Storage（`batch-pdf/${tenant_id}/...`、`src/app/api/qstash/batch-pdf/route.ts`）。 |
| ② スキャナ読取り電磁的記録を保存 | 画像アップロード基盤 `certificate_images`（`storage_path` / `content_type` / `sha256`）でスキャン相当の画像保存が可能。ただし Ledra の主経路は電子作成（①）であり、紙のスキャン取込みを前提とした専用フローは持たない。 |

### （３）直ちに明瞭な状態で表示・書面作成できる措置（施行規則第４条） — ✅ 対応

| 規制要求 | 実装 |
| --- | --- |
| 直ちに明瞭な状態で映像面に表示し、書面を作成できる | 管理画面での表示に加え、PDF 生成で書面化可能。`renderDocumentPdf`（`src/lib/pdfDocument.ts`）、`renderCertificatePdf`、証明書公開ページ `/c/[public_id]`。PDF ダウンロードは `content-disposition: attachment`（`src/app/admin/documents/pdf/route.ts`）。 |

### （４）指定整備記録簿は指定様式であること（指定整備事業規則第10条の２） — ❓要確認

| 規制要求 | 実装 |
| --- | --- |
| 表示・作成される**指定整備記録簿**は、指定整備事業規則第10条の２に定める様式であること | **指定整備記録簿の法定様式に一致する出力の実装は、コード調査では確認できなかった。** `certificates` / `inspection_records` / `body_repair_jobs` は存在するが、これらが指定整備事業規則の様式に準拠した「指定整備記録簿」として出力されるかは未確認。指定自動車整備事業者（民間車検場）を対象顧客に含めるなら、様式準拠の記録簿出力が別途必要になる可能性が高い。→ OPEN_QUESTIONS に起票。 |

### （５）受検時は書面の点検整備記録簿を提示 — 🏢 事業者運用（PDF で支援）

運輸支局・検査登録事務所・軽自動車検査協会での受検時は書面提示が求められる（電磁的記録では不可）。
これは受検者側の運用ルールであり、Ledra は PDF 出力（上記（３））で書面化を支援する。

> ※ 取扱い注記のとおり、自動車特定整備事業者・指定自動車整備事業者は**点検整備記録簿**の作成・保存義務は
> 負わない（自主的に作成・保存する場合を想定）。一方、**特定整備記録簿**（法第91条）は特定整備事業者、
> **指定整備記録簿**（法第94条の６）は指定整備事業者に作成義務がある。

---

## 第２ ２．作成・保存のガイドライン

### （１）電磁的記録を検索できる措置 — ✅ 対応（帳票）／⚠️ 記録簿本体は限定

| 規制要求 | 実装 |
| --- | --- |
| 点検整備記録簿等の電磁的記録を検索できる措置 | 帳票検索 API `GET /api/admin/documents` が日付（`issued_at` gte/lte）・金額（`total` gte/lte）・取引先（`recipient_name` ilike ＋顧客名）・種別・状態で検索（電帳法「可視性の確保」実装、commit a3416a7）。証明書は一覧・エクスポート UI（`src/app/admin/certificates`）。**⚠️** `body_repair_jobs` / `inspection_records` を記録簿として横断検索する専用 UI は、帳票ほど整備されていない可能性（要確認）。 |

### （２）電磁的記録媒体に移行できる措置 — ✅ 対応（エクスポートで代替）

| 規制要求 | 実装 |
| --- | --- |
| 電磁的記録を電磁的記録媒体に移行できる措置 | テナント全体エクスポート `GET /api/admin/data-export`（owner 限定・JSON・`schema_version:"1.0"`）、証明書エクスポート（`export` / `export-selected` / `export-one`）、帳票・在庫の CSV 系エクスポート。ダウンロードした電子データを SD カード等の媒体に保存できるため、実質的に移行可能。**注**: 外部媒体・アーカイブ（S3/R2 等）への専用書き出しスクリプトは未実装（`docs/data-retention.md` に TODO として記載）。 |

### （３）作成・保存・更新・消去の日時、更新箇所、作業者を自動記録・保存 — ⚠️ 部分対応

| 対象 | 状況 |
| --- | --- |
| 証明書（certificates） | ✅ **ほぼ完全**。`certificate_edit_histories`（`edited_by` ＋ `changes:[{field,label,old,new}]` の**更新箇所差分**、`20260408000000_...`）、`certificate_versions`（`created_by` / `server_received_at`＝権威時刻 / SHA-256 ハッシュ、**UPDATE 拒否トリガで不変**、`20260719000001_...`）、`audit_logs`（`performed_by` / `old_values` / `new_values` / `performed_at`、`20260325000001_...`）。 |
| 帳票・整備記録簿本体（documents / inspection_records / body_repair_jobs） | ⚠️ 差あり。`body_repair_jobs.recorded_by`（記録者）はあるが、証明書のような**フィールド単位の更新差分＋更新者の自動履歴**が全レコード横断で揃っているわけではない。汎用 `audit_logs` は存在するが、書込みは個別 API の明示 insert 依存で、`updated_by` を全テーブル自動記録する行トリガは無い。 |
| 「消去」の日時記録 | ⚠️ **要確認**。`data-retention` cron（`src/app/api/cron/data-retention/route.ts`）が保持期限超過データを削除・匿名化するが、**削除イベント自体を監査ログに残す実装は未確認**。規制は「消去の日時」の自動記録も求めるため、ここは要点検。 |

→ 本項は準拠上の**急所**。証明書は満たすが、記録簿本体・帳票・消去ログに差分が残る。OPEN_QUESTIONS に起票。

### （４）保管場所を定め施錠する等し、不正改ざんを防止 — ✅ 対応

| 規制要求 | 実装 |
| --- | --- |
| 保管場所を定め施錠する等（アクセス制御） | クラウド（Supabase）で保管。RLS（`my_tenant_ids()` / `_apply_standard_rls` によるテナント分離、SELECT=全メンバー / INSERT・UPDATE=owner,admin,staff / DELETE=owner,admin）、Supabase Auth ＋ MFA ＋ WebAuthn で論理施錠。物理施錠はクラウド事業者に委譲。 |
| 不正改ざんの防止 | 多層防御。**確定帳票の封印**（`documents.meta_json.integrity_seal`＝SHA-256 ＋ RFC3161 TS、`src/lib/documents/documentSeal.ts`）、**証明書版の不変トリガ**（`certificate_versions_no_update()`）、**Polygon アンカリング**（`certificateAnchorService`）、**C2PA 署名**（`c2paSigner`）、写真の RFC3161 TS（`certificate_images.tsa_token`）。 |

### （５）バックアップによるデータ消失対策 — ⚠️ 部分対応（マネージド依存）

| 規制要求 | 実装 |
| --- | --- |
| バックアップを行いデータ消失対策・安全性を確保 | Supabase のマネージドバックアップ（日次バックアップ / PITR）に依存。**コードベース内にバックアップ設定・定期検証・復旧手順の明示記述は該当なし。** 上記（２）のエクスポートは論理バックアップの代替として利用可能。→ 運用として Supabase プランのバックアップ設定・復旧テストを明文化しておくことが望ましい。 |

---

## 第２ ３．整備記録システムの適正な使用方法のガイドライン

### （１）技術面の安全対策

#### ① 権限別の ID・パスワード等による利用者登録・管理・認証 — ⚠️ 部分対応（認証は堅牢／法定資格ロールが未区別）

| 規制が例示する権限区分 | 実装 |
| --- | --- |
| 認証機能そのもの（ID/PW・利用者登録・管理） | ✅ Supabase Auth（ID/PW）＋ TOTP MFA（`src/lib/auth/mfa.ts`）＋ WebAuthn 操作署名（`operator_credentials` / `webauthn_assertions`、重要操作を登録済み認証器に暗号的に束縛、`20260721093116_webauthn.sql`）。 |
| 自動車検査員に係る権限（指定整備事業者に限る） | ❌ **未区別**。 |
| 整備主任者に係る権限 | ❌ **未区別**。 |
| 点検整備記録簿等を起票・入力する権限 | ⚠️ `certificates:create/edit`・`requireMinRole(caller,"staff")` 等で起票・入力の権限制御はあるが、**「整備主任者」「自動車検査員」という法定資格に対応した権限区分は存在しない**。 |

Ledra の権限は汎用 SaaS ロール（`super_admin` / `owner` / `admin` / `staff` / `viewer`、`src/lib/auth/roles.ts`・`permissions.ts`）＋店舗ロール（`manager` / `staff`）＋作業者レジストリ（`staff_members.kind` = internal/external、`skills[]`）で構成され、**整備業の法定資格・職責（自動車検査員 / 整備主任者 / 起票入力担当）を区別する軸を持たない。** 本項も準拠上の**急所**。→ OPEN_QUESTIONS に起票。

#### ② オンライン接続時のユーザー認証 — ✅ 対応

公衆回線経由の全アクセスが Supabase Auth 認証必須。アクセスするユーザーの正当性を識別・認証している。

#### ③ 記載項目・入力権限のエラー検出（入力漏れ・誤操作防止） — ✅ 対応

Zod スキーマによる必須項目・enum・範囲・実在暦日（`isRealCalendarDate()` が 2026-02-31 等を拒否）検証（`src/lib/validations/inspection.ts`・`body-repair-job.ts`）。API 層で認証 ＋ 権限（`requireMinRole`）＋ クロステナント参照検証（`validateTenantRefs()`、他テナントの ID 混入を拒否）。PATCH の `normalizeOptional()` で省略フィールドの誤消去を防止。

### （２）運用面の安全対策

#### ① 管理責任者・管理規程（ID 付与/廃止、媒体の使用・保管・搬出入・廃棄） — 🏢 事業者運用

システムではなく組織の管理規程・管理責任者の設置で満たす項目。Ledra はメンバー管理 UI（`tenant_memberships` の変更は owner のみ）で ID 付与/廃止の**運用を支援**するが、管理規程そのものは事業者が定める。

#### ② 非使用時の機能停止・ID 非共用・関係者外の操作禁止の周知 — 🏢 事業者運用（技術的抑止あり）

ID 共用禁止・非使用時停止・周知は運用ルール。技術面では、セッション失効（`customer_sessions.revoked_at`）、認証必須、**WebAuthn が個人の認証器に束縛される**ため ID 共用を技術的に抑止する要素がある。「非使用時の機能停止」は事業者運用。

#### （３）管理規程の策定・周知・操作マニュアルの備付け — 🏢 事業者運用

法定の管理規程整備・操作マニュアル備付けは事業者責任。Ledra は操作ヘルプの提供で支援しうるが、規程・マニュアルの整備は事業者側で必要。

---

## 第２ ４．特定整備記録簿の写しを電磁的記録により交付する場合の遵守事項

### （１）交付方法（メール送信 / ダウンロード / 電磁的記録媒体の受渡し、施行規則第11条第１項） — ✅ 対応

| 規制要求 | 実装 |
| --- | --- |
| 電子メール等での送信 / ウェブ・クラウドからのダウンロード / 媒体受渡し | 帳票共有 `POST /api/admin/documents/share`（`channel` = email / line / sms、`sendDocumentEmail` 等）。PDF ダウンロード（attachment）。証明書公開ページ `/c/[public_id]`。交付ログ `document_share_log`（`channel` / `recipient` / `status` / `sent_by` / `idempotency_key`）。 |

### （２）使用者が出力し書面を作成できること（施行規則第11条第２項） — ✅ 対応

PDF ダウンロード（`content-disposition: attachment`）により、使用者が自ら印刷して書面化できる。

### （３）交付前に方法を示し、書面又は電磁的方法で承諾を得る（施行規則第12条・政令第２条第１項） — ⚠️ 部分対応

| 規制要求 | 実装 |
| --- | --- |
| （１）のいずれの方法で交付予定かを示し、書面/電磁的方法で承諾を得る | 承諾・電子署名基盤は充実（`signature_sessions`＝二要素〔電話下4桁ハッシュ〕・`consent_text_hash`、`body_repair_consents`〔kind: pre_work/change/post_work〕、`delivery_receipts`）。**ただしこれらは「作業内容・受領」への同意が主で、「電子交付そのもの・交付方法の選択」への事前承諾を専用に取得・記録する仕組みは未確認。** 汎用の同意基盤を流用すれば実装可能だが、現状は専用フロー無し。→ OPEN_QUESTIONS に起票。 |

### （４）承諾が得られない / 撤回された場合は電磁的交付をしてはならない（政令第２条第２項） — ⚠️ 未対応寄り

| 規制要求 | 実装 |
| --- | --- |
| 承諾なし・承諾撤回時は電磁的交付を禁止 | 同意の**無効化（cancel）**は実装あり（`signature_sessions.status='cancelled'`＋`cancel_reason`、内容変更時に旧 pending を失効させ再発行）。しかし**使用者起点の「電子交付承諾の撤回」専用フロー、および撤回後に電子交付をブロックするロジックは該当なし。** → OPEN_QUESTIONS に起票。 |

### （５）閲覧・表示・書面作成方法の教示 — 🏢/⚠️ 運用（導線あり）

顧客ページで閲覧・PDF 出力（書面作成）の導線は存在するが、「閲覧・表示・書面作成の方法を教示する」明示的な案内文の有無は未確認。運用（送付メール文面・ヘルプ）で担保する。

> ※ 取扱い注記のとおり、点検整備記録簿・指定整備記録簿及びこれらの写しの交付義務はないが、
> 事実上交付する場合は本項目に準じる。

---

## ギャップ一覧（優先度順）

| # | ギャップ | 該当条項 | 区分 |
| --- | --- | --- | --- |
| G1 | 法定資格ロール（自動車検査員 / 整備主任者 / 起票入力）が権限体系に無い | 第２ ３（１）① | システム |
| G2 | 更新箇所＋作業者の自動履歴が記録簿本体・帳票で不完全、**消去ログ未確認** | 第２ ２（３） | システム |
| G3 | 電子交付方法の**事前承諾**を専用取得する仕組みが未実装 | 第２ ４（３） | システム |
| G4 | **交付承諾の撤回**フローと撤回後の交付ブロックが未実装 | 第２ ４（４） | システム |
| G5 | **指定整備記録簿の法定様式**出力が未確認（指定整備事業者を顧客に含める場合に必須の可能性） | 第２ １（４） | システム/要確認 |
| G6 | バックアップ・復旧手順がコード上明示されず、Supabase マネージド依存 | 第２ ２（５） | 運用/要確認 |
| G7 | 管理規程・管理責任者・操作マニュアル・ID 共用禁止周知 | 第２ ３（２）（３） | 事業者運用 |

> G1〜G5 はシステム実装で埋めうるギャップ、G6〜G7 は事業者の運用・規程で担保する領域。
> 本書はマッピングのみで実装は行っていない。実装着手可否は代表判断。

---

## 実装ファイル一覧（根拠）

- 権限・認証: `src/lib/auth/roles.ts`, `permissions.ts`, `checkRole.ts`, `mfa.ts`;
  `supabase/migrations/20260313020000_core_tables.sql`（RLS ヘルパー）,
  `20260323020000_rls_role_constraints.sql`, `20260721093116_webauthn.sql`
- 監査・版管理: `20260325000001_mobile_support.sql`（`audit_logs`）,
  `20260408000000_certificate_edit_histories.sql`, `20260719000001_certificate_versions.sql`,
  `20260324130000_order_audit_log.sql`; UI `src/app/admin/audit/page.tsx`
- 入力検証: `src/lib/validations/inspection.ts`, `body-repair-job.ts`;
  `src/app/api/admin/inspection-records/route.ts`
- 作成・保存: `20260314000000_documents.sql`, `20260313020000_core_tables.sql`（certificates）,
  `20260612000018_inspection_checklists.sql`, `20260620000000_body_repair_transparency.sql`;
  PDF `src/lib/pdfDocument.ts`, `src/app/api/qstash/batch-pdf/route.ts`
- 検索・エクスポート: `src/app/api/admin/documents/route.ts`, `src/app/api/admin/data-export/route.ts`
- 改ざん防止: `src/lib/documents/documentSeal.ts`, `src/lib/anchoring/*`（Polygon / C2PA / TSA）
- 交付・承諾: `src/app/api/admin/documents/share/route.ts`, `20260326000002_document_share_log.sql`,
  `20260403000000_add_electronic_signature.sql`, `20260506000000_delivery_receipts.sql`;
  `src/lib/signature/bodyRepairConsent.ts`, `deliveryReceipt.ts`
- 保持期間: `body_repair_jobs.record_retention_until`, `src/app/api/cron/data-retention/route.ts`,
  `docs/data-retention.md`

## 保持期間ポリシー（関連）

`record_retention_until` は「この日まで保持する」マーカーであり、`data-retention` cron は
車体整備記録をこの日付より前に削除してはならない。特定整備記録簿の2年保存義務（道路運送車両法）を
満たすため。詳細は `docs/body-repair-transparency-compliance.md`「保存期間ポリシー」を参照。
