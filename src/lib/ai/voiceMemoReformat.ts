/**
 * 音声メモ → 証明書ドラフト 整形 AI モジュール。
 *
 * 施工士が施工中・直後に喋った内容 (Web Speech API でブラウザ側で書き起こした
 * 生テキスト) を受け取り、施工証明書のフィールドに収まる構造化ドラフトに
 * 変換する。AiDraftPanel が出す { title / description / cautions } と
 * 同じ形を返すので、フォーム適用ロジックは流用できる。
 *
 * 失敗時 (ANTHROPIC_API_KEY 未設定 / レスポンス壊れ / タイムアウト) は null を
 * 返してフェイルオープン。UI は「下書きを生成できませんでした」を表示するだけ。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface VoiceMemoReformatInput {
  /** Web Speech API などで書き起こされた生テキスト (改行・整形なし) */
  transcript: string;
  /** "ppf" / "coating" / "body_repair" など — 施工種別ヒント */
  serviceType?: string;
  /** 車両・顧客名など、メモには出てこないが文章に効く文脈 (任意) */
  vehicleHint?: string;
  customerHint?: string;
}

export interface VoiceMemoDraft {
  /** 1 行の見出し (30 文字以内) */
  title: string;
  /** 施工内容の構造化本文。HTML ではなくプレーンテキスト + 改行 */
  description: string;
  /** 注意事項 / 保証除外などの補足。空でも OK */
  cautions: string;
}

const VoiceMemoSchema = z.object({
  title: z.string(),
  description: z.string(),
  cautions: z.string(),
});

const SYSTEM_PROMPT = `あなたは自動車施工の証明書作成を補助するアシスタントです。
施工士が口頭で残した音声メモ (書き起こし済) を、証明書に貼れる構造化された
ドラフトに整形してください。

ルール:
- transcript に書かれていない事実を作らない (ハルシネーション禁止)。
- 整形しても元の語順や情報は保つ。憶測で施工工程を追加しない。
- description は 200〜400 文字程度。短いメモは無理に膨らませず簡潔に。
- title は 30 文字以内、施工の概要を 1 行で。
- cautions は transcript に「注意」「気をつけて」「経年で」などが
  含まれていれば抽出する。無ければ空文字列で良い。
- 必ず以下の JSON 形式のみで回答する。前後に説明テキストを書かない:
  {"title":"...","description":"...","cautions":"..."}
`.trim();

export async function reformatVoiceMemo(input: VoiceMemoReformatInput): Promise<VoiceMemoDraft | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const transcript = (input.transcript ?? "").trim();
  if (!transcript) return null;

  const client = getAnthropicClient();

  const contextLines: string[] = [];
  if (input.serviceType) contextLines.push(`施工種別: ${input.serviceType}`);
  if (input.vehicleHint) contextLines.push(`車両: ${input.vehicleHint}`);
  if (input.customerHint) contextLines.push(`顧客: ${input.customerHint}`);

  const userMessage = [
    contextLines.length ? `補足情報:\n${contextLines.map((l) => `- ${l}`).join("\n")}` : null,
    "音声メモ:",
    transcript,
    "",
    "上記から JSON を生成してください。",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(VoiceMemoSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return null;

    return {
      title: parsed.title.trim().slice(0, 60),
      description: parsed.description.trim(),
      cautions: parsed.cautions.trim(),
    };
  } catch (err) {
    console.error("[voiceMemoReformat] generation failed:", err);
    return null;
  }
}
