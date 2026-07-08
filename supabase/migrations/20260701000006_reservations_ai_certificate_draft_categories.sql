-- reservations.ai_certificate_draft に「カテゴリー別下書き」を追加できるよう
-- コメント (ドキュメント) を更新する。列は jsonb のため物理スキーマ変更は不要。
--
-- 背景: 予約に複数種類の作業依頼 (menu_items_json) がある場合、AI は作業を
-- 大カテゴリー (coating / ppf / wrapping / window_film / detailing / maintenance /
-- body_repair / general) ごとに分類し、カテゴリー単位で証明書下書きを 1 枚ずつ生成する。
--
-- 後方互換: 従来どおり単一の `draft` (= drafts[0] 相当) を必ず保持する。
-- 単一カテゴリー / 作業依頼なしの場合は `drafts` を省略し、`draft` のみ。
--
-- スキーマ (jsonb):
--   {
--     "draft":    { title, description, materials[], ... },   -- primary (後方互換)
--     "policies": { "certificate.title": "auto|suggest|manual", ... },
--     "drafts": [                                              -- 複数作業依頼のとき
--       {
--         "category": "coating",
--         "categoryLabel": "コーティング",
--         "workItems": ["ガラスコーティング"],
--         "draft":   { title, description, ... },
--         "policies": { ... }
--       }
--     ],
--     "auto": true,
--     "generated_at": "YYYY-MM-DDTHH:mm:ssZ"
--   }

COMMENT ON COLUMN reservations.ai_certificate_draft IS
  'certificate.auto_draft が生成した証明書下書き (draft + policies + generated_at)。複数種類の作業依頼は drafts[] に大カテゴリー単位で 1 枚ずつ保持し、draft は primary (drafts[0]) 相当。NULL = 未生成。発行は必ず人が行う (壁3)。';
