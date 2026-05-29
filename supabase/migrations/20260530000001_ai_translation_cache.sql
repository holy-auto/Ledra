-- AI 翻訳のキャッシュテーブル。
--
-- `src/lib/ai/translateContent.ts` の `translationCacheKey(text, lang, tone)` で
-- 計算される安定ハッシュをキーに、同じ原文 × 同じ言語 × 同じトーンの翻訳を
-- 1 度だけ Anthropic に投げ、以後は再利用する。
--
-- 設計:
--   - tenant_id は持たない (翻訳結果は固有名詞を含まない一般文書を想定。
--     glossary を含む呼び出しはキャッシュ対象外として cache_key 側で
--     区別される。テナント別に分けたい場合は cache_key に tenant_id を
--     混ぜる別 lib 関数を用意する想定)
--   - 30 日経過した entry は data-retention cron で削除予定 (定期 vacuum)
--   - hit_count は監視・コスト分析用 (キャッシュ効率の指標)
--
-- 書き込みは `/api/admin/translate` route が translate 完了後に upsert する。
-- 読み込みは同じ route が translate 直前に SELECT する (cache hit なら AI 不要)。

CREATE TABLE IF NOT EXISTS ai_translation_cache (
  cache_key       text PRIMARY KEY,
  source_text     text NOT NULL,
  target_lang     text NOT NULL,
  tone            text NOT NULL DEFAULT 'formal',
  translated_text text NOT NULL,
  model           text,
  confidence      numeric(3, 2),
  hit_count       integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_translation_cache IS
  '翻訳結果のキャッシュ。cache_key = translationCacheKey(text, lang, tone)。同じ原文 × 言語 × トーンの再翻訳を avoid する。';
COMMENT ON COLUMN ai_translation_cache.hit_count IS
  'このキャッシュエントリが使い回された回数。コスト削減量の試算に使う。';

CREATE INDEX IF NOT EXISTS idx_ai_translation_cache_lang ON ai_translation_cache (target_lang, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_translation_cache_age ON ai_translation_cache (created_at);

-- キャッシュは PII を含まない前提だが、念のため anon からの直接アクセスは禁止 (service-role 経由のみ書き込み / 読み込み)。
ALTER TABLE ai_translation_cache ENABLE ROW LEVEL SECURITY;
