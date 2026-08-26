# ADR-0006: 車両 identity と顧客 PII の分離

- Status: Accepted(2026-08-19, IMP-001)

## 背景

v2.0 §9 / §18.2: 車両は顧客 identity から独立した永続エンティティであり、所有者が
変わっても車両履歴は維持するが、前所有者の氏名・電話・住所等の PII は新所有者に
渡さない。データ構造は
`VEHICLE → JOB → WORK/EVIDENCE/CERTIFICATE` と
`VEHICLE → CUSTOMER RELATIONSHIP → CUSTOMER PII` を分離する。
現状は `vehicles` が独立エンティティで `vehicle_passports`(所有権移転)も存在するが、
顧客との関係は `vehicles.customer_id` の直付けで、関係モデルの分離は部分的
(`docs/implementation/requirement-trace.md` §4 不変条件9)。

## 決定

1. 車両履歴・証跡・証明書は**車両に帰属**させ、顧客 PII を証跡コアに埋め込まない。
2. 顧客と車両の関係(所有・利用)は関係として表現し、関係の終了(売却・譲渡)で
   車両履歴が消えたり、前所有者 PII が新所有者に露出したりしない設計とする
   (関係モデルの本実装は IMP-025)。
3. 削除・匿名化要求には identity レイヤの匿名化で応じ、業務上・法令上保持が必要な
   Work / Evidence / Financial 履歴は Retention Policy に従って保持できる構造にする
   (v2.0 §18.2、実装は IMP-050)。
4. 公開証明・第三者検証は PII なしで成立させる(現行の `certificate_anchors.canonical_json`
   が PII 非含有を型で保証している方針を維持する)。

## 影響

- 「車両を売ったら履歴が消える/前の持ち主の情報が見える」という事故を構造的に防ぐ。
- IMP-025(車両パスポート)・IMP-050(プライバシー強化)は本 ADR を前提に設計する。
