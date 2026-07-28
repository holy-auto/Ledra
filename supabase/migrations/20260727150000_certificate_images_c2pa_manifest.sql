-- C2PA署名マニフェストの「要約」を保存する列。
-- 署名時に封入した内容（署名者モード・c2pa.actions 台帳・com.ledra.capture 束縛の要約）を
-- 決定的に組み立てたもの。読み戻し(Reader API)には依存しない。単回nonceの生値は含めない
-- （封入したか否かの真偽のみ）。追加のみ・NULL 許容・デフォルト無しで後方互換。
ALTER TABLE certificate_images
  ADD COLUMN IF NOT EXISTS c2pa_manifest jsonb;

COMMENT ON COLUMN certificate_images.c2pa_manifest IS
  'C2PA署名マニフェストの要約（signerMode / actions台帳 / com.ledra.capture封入値の要約）。生のnonceは含めない。';
