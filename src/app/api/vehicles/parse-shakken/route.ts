import { apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { resolveCallerBasic } from "@/lib/api/auth";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCR_PROMPT = `これは日本の自動車検査証（車検証）の写真です。
以下のフィールドを読み取り、JSON形式のみで返答してください。マークダウン記法（コードブロックなど）は使わないでください。

{
  "maker": "自動車製作者名（例: トヨタ）または null",
  "model": "型式または車名（例: プリウス）または null",
  "year": 初度登録年（西暦4桁の整数）または null,
  "vin_code": "車台番号（英数字）または null",
  "plate_display": "登録番号（例: 水戸 300 あ 12-34）または null"
}

読み取れない項目は null としてください。推測による補完は行わないでください。JSONのみ返してください。`;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return apiInternalError(new Error("ANTHROPIC_API_KEY not configured"), "parse-shakken");
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return apiValidationError("ファイルが見つかりません。");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return apiValidationError("JPG / PNG / GIF / WEBP 形式の画像を選択してください。");
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: file.type,
                  data: base64,
                },
              },
              {
                type: "text",
                text: OCR_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return apiInternalError(new Error(`Anthropic API error: ${errText}`), "parse-shakken");
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";

    let extracted: Record<string, unknown>;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      return apiInternalError(new Error(`Failed to parse OCR response: ${rawText}`), "parse-shakken json");
    }

    return Response.json({
      ok: true,
      extracted: {
        maker: extracted.maker ?? null,
        model: extracted.model ?? null,
        year: extracted.year ?? null,
        vin_code: extracted.vin_code ?? null,
        plate_display: extracted.plate_display ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "parse-shakken");
  }
}
