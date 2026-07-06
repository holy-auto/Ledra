-- =============================================================
-- 法人顧客登録の拡充項目
--
-- 法人顧客をより実務に即した形で登録できるよう、以下を追加する。
--
--   corporate_number           : 法人番号 (13桁, 国税庁法人番号公表サイト準拠)。任意。
--   invoice_registration_number: 適格請求書発行事業者登録番号 (T+13桁)。任意。
--                                 tenants.registration_number (自社側) とは別に、
--                                 法人顧客自身が発行事業者である場合の番号を保持する。
--   short_name                 : 顧客略称名。一覧・画面上の表示用 (書類の正式名称は name を使用)。
--   honorific                  : 敬称 (御中/様)。書類作成時の宛名敬称のデフォルト値として使う想定。
--                                 documents.recipient_honorific (書類ごとの敬称) とは別の
--                                 顧客マスタ側のデフォルト値。
--   transfer_fee_payer         : 振込手数料負担。customer=先方 / company=当方。
--   document_delivery_method   : 書類送付方法。download=DLページ方式 / email=メール添付方式。
--   nda_status                 : NDA(秘密保持契約)締結状況。
--   basic_contract_status      : 基本契約書締結状況。
-- =============================================================

alter table customers
  add column if not exists corporate_number text
    check (corporate_number is null or corporate_number ~ '^[0-9]{13}$');

alter table customers
  add column if not exists invoice_registration_number text
    check (invoice_registration_number is null or invoice_registration_number ~ '^T[0-9]{13}$');

alter table customers
  add column if not exists short_name text;

alter table customers
  add column if not exists honorific text
    check (honorific in ('御中', '様', ''));

alter table customers
  add column if not exists transfer_fee_payer text
    check (transfer_fee_payer in ('customer', 'company'));

alter table customers
  add column if not exists document_delivery_method text
    check (document_delivery_method in ('download', 'email'));

alter table customers
  add column if not exists nda_status text not null default 'unsigned'
    check (nda_status in ('signed', 'unsigned'));

alter table customers
  add column if not exists basic_contract_status text not null default 'unsigned'
    check (basic_contract_status in ('signed', 'unsigned'));

comment on column customers.corporate_number is
  '法人番号 (13桁, 任意)。';
comment on column customers.invoice_registration_number is
  '顧客自身の適格請求書発行事業者登録番号 (T+13桁, 任意)。自社側は tenants.registration_number。';
comment on column customers.short_name is
  '顧客略称名 (画面表示用, 任意)。書類の正式名称は name を使用。';
comment on column customers.honorific is
  '敬称のデフォルト値 (御中/様/空)。書類ごとの敬称は documents.recipient_honorific で個別に上書き可能。';
comment on column customers.transfer_fee_payer is
  '振込手数料負担。customer=先方負担 / company=当方負担。';
comment on column customers.document_delivery_method is
  '書類送付方法。download=DLページ方式 / email=メール添付方式。';
comment on column customers.nda_status is
  'NDA(秘密保持契約)締結状況。signed=済 / unsigned=未。';
comment on column customers.basic_contract_status is
  '基本契約書締結状況。signed=済 / unsigned=未。';
