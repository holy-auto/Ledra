-- =============================================================
-- signature_sessions.certificate_id を nullable 化
--
-- 車体整備 作業前/変更同意 (purpose='estimate_consent'/'change_consent') は
-- 証明書に紐づかない案件ベースの署名のため certificate_id を持たない。
-- 既存の証明書署名・受領サインは引き続き certificate_id を必須相当で設定する
-- (アプリ側で常に値を入れる) ため、制約を緩めても挙動は変わらない。
--
-- DROP NOT NULL はカタログのみの変更 (全行スキャン無し) で即時完了する。
-- =============================================================

alter table signature_sessions alter column certificate_id drop not null;

comment on column signature_sessions.certificate_id is
  '対象証明書。証明書署名/受領サインでは必須。車体整備の作業前/変更同意 '
  '(purpose=estimate_consent/change_consent) では NULL (案件 = body_repair_consents 側で紐付け)。';
