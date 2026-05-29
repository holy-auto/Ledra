-- customer_messages.ai_extracted: 受信メッセージから AI が抽出した予約候補。
--
-- 既存の LINE / メール / SMS inbound メッセージは `customer_messages` に
-- direction='inbound' で記録される。本カラムは
-- `extractInboundReservation` (`src/lib/ai/inboundReservationExtract.ts`) の
-- 戻り値スナップショットを保持し、admin UI が「AI 抽出して予約候補化」を
-- 押した時点の結果を時系列で残せるようにする。
--
-- スキーマ (jsonb):
--   {
--     "intent": "new_reservation" | "change_reservation" | "cancel" | "inquiry_only" | "other",
--     "customer_name"?: string,
--     "phone"?: string,
--     "email"?: string,
--     "vehicle"?: string,
--     "scheduled_date"?: "YYYY-MM-DD",
--     "date_text"?: string,
--     "service"?: string,
--     "note"?: string,
--     "confidence": number,
--     "extracted_at": "YYYY-MM-DDTHH:mm:ssZ",
--     "model": string
--   }
--
-- NULL のままが普通 (まだ抽出していない / そもそも予約意図なし)。
-- カラムは nullable・index 無し (検索は jsonb GIN を将来必要になったら追加)。

ALTER TABLE customer_messages
  ADD COLUMN IF NOT EXISTS ai_extracted jsonb;

COMMENT ON COLUMN customer_messages.ai_extracted IS
  'AI 抽出 (extractInboundReservation) の戻り値スナップショット。intent / 予約候補フィールド / confidence を含む。NULL = 未処理。';
