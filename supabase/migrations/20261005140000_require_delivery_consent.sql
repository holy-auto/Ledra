-- 記録簿の写しの電子交付: 未承諾（none）のハードブロックをテナント opt-in にする。 [G3/G4 / 第２ ４（３）]
--
-- 既定の enforcement は「撤回（revoked）のときだけブロック」（規制(4)・常時オン）。
-- 本フラグを true にしたテナントでは、承諾記録が無い顧客への電子交付もブロックする（規制(3)の事前承諾を
-- システムで強制）。既定 false＝非破壊（既存の交付を一斉に止めない）。判定はアプリ層
-- （src/lib/delivery/deliveryConsent.ts の electronicDeliveryBlockMessage）。

alter table tenants
  add column if not exists require_delivery_consent boolean not null default false;

comment on column tenants.require_delivery_consent is
  'true で記録簿の写しの電子交付に事前承諾（delivery_consents.status=granted）を必須化（第２ ４（３））。既定 false=撤回時のみブロック（非破壊）。G3/G4。';
