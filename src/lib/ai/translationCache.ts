/**
 * 翻訳結果キャッシュの read/write ヘルパ。
 *
 * - `getCachedTranslation(cacheKey)`: cache hit なら translated_text + メタを返す。
 *   見つからなければ null。失敗 (テーブル未作成等) も null。
 * - `putCachedTranslation(...)`: 翻訳完了後に upsert。
 *
 * 監視:
 *   - cache hit 時に hit_count を +1 (UPDATE で last_accessed_at も更新)
 *   - キャッシュは tenant 横断 (PII 非依存の文書を想定)。テナント固有用語が
 *     入る場合は translationCacheKey 側に tenant_id を混ぜて隔離する設計
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export interface CachedTranslation {
  translated_text: string;
  model: string | null;
  confidence: number | null;
  hit_count: number;
}

export async function getCachedTranslation(cacheKey: string): Promise<CachedTranslation | null> {
  if (!cacheKey) return null;
  try {
    const admin = createServiceRoleAdmin("translation cache read — tenant-agnostic by design");
    const { data, error } = await admin
      .from("ai_translation_cache")
      .select("translated_text, model, confidence, hit_count")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data) return null;
    // hit_count を +1 + last_accessed_at 更新 (失敗してもデータは返す)
    void admin
      .from("ai_translation_cache")
      .update({ hit_count: (data.hit_count as number) + 1, last_accessed_at: new Date().toISOString() })
      .eq("cache_key", cacheKey);
    return {
      translated_text: data.translated_text as string,
      model: (data.model as string | null) ?? null,
      confidence: typeof data.confidence === "number" ? data.confidence : null,
      hit_count: data.hit_count as number,
    };
  } catch {
    return null;
  }
}

export async function putCachedTranslation(input: {
  cacheKey: string;
  sourceText: string;
  targetLang: string;
  tone: string;
  translatedText: string;
  model?: string | null;
  confidence?: number | null;
}): Promise<void> {
  if (!input.cacheKey || !input.translatedText) return;
  try {
    const admin = createServiceRoleAdmin("translation cache write — tenant-agnostic by design");
    await admin.from("ai_translation_cache").upsert(
      {
        cache_key: input.cacheKey,
        source_text: input.sourceText,
        target_lang: input.targetLang,
        tone: input.tone,
        translated_text: input.translatedText,
        model: input.model ?? null,
        confidence: input.confidence ?? null,
        last_accessed_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    /* テーブル未作成等は無視 */
  }
}
