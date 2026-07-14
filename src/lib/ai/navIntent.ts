/**
 * ナビゲーション補助（自然文 → 管理画面 href）
 *
 * ユーザーが「予約を開いて」「先月の売上どこ」等の自由文を打つと、
 * 管理画面のどの画面を開けばよいかを Claude（軽量モデル）に判定させる。
 *
 * 単一の出典: 画面カタログは `adminCommandItems()`（NAV_GROUPS 由来）を再利用し、
 * ラベル/href を二重管理しない。
 *
 * セキュリティ（トラスト境界）: モデルの出力する href は「創作されうる」ため、
 * 必ず `resolveHrefFromCatalog()` で既知カタログに実在するか照合してから返す。
 * これによりハルシネーション経路 / オープンリダイレクトを防ぐ。到達先ページの
 * アクセス制御は別途 AdminRouteGuard が担保するため、ここでは role 別に
 * カタログを絞らない（カタログ全件を候補にし、最終防御は RouteGuard）。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST, cacheableSystem } from "@/lib/ai/client";
import { adminCommandItems } from "@/components/ui/Sidebar";

// ビルド時固定の画面カタログ（NAV_GROUPS が単一の出典）。
const CATALOG = adminCommandItems();

// href の正規化（前後空白・末尾スラッシュ除去・小文字化）→ 正規 href の索引。
// パスは一意な小文字なので小文字照合で衝突しない。
function normHref(raw: string): string {
  return String(raw).trim().toLowerCase().replace(/\/+$/, "");
}
const HREF_BY_NORM = new Map(CATALOG.map((c) => [normHref(c.href), c.href] as const));

/**
 * モデルが返した href をカタログに実在する正規 href に解決する。
 * 実在しなければ null（= 開かない / 候補で代替）。トラスト境界の要。
 */
export function resolveHrefFromCatalog(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normHref(raw);
  if (!key) return null;
  return HREF_BY_NORM.get(key) ?? null;
}

const NavIntentSchema = z.object({
  href: z.string().nullable(),
  reply: z.string(),
  alternatives: z.array(z.string()),
});

export interface NavIntentResult {
  /** 開く画面（カタログ照合済み）。一致無しは null。 */
  href: string | null;
  /** 日本語1文の応答（「予約管理を開きます」等）。 */
  reply: string;
  /** 近い候補の href（カタログ照合済み・最大3件）。 */
  alternatives: string[];
}

const CATALOG_TEXT = CATALOG.map((c) => `${c.href}\t${c.label}${c.section ? `（${c.section}）` : ""}`).join("\n");

const SYSTEM_PROMPT = `あなたは Ledra 管理画面のナビゲーション補助です。
ユーザーの自由文の要望に最も一致する画面を、下の一覧から1つだけ選びます。

出力ルール:
- href は必ず下の一覧の値をそのままコピーして返す。一覧に無いパスを創作しない。
- 十分に一致する画面が無ければ href は null にし、alternatives に近い候補の href を最大3件入れる。
- reply は日本語1文で、開く画面名（または候補提示）を簡潔に述べる。

画面一覧 (href<TAB>ラベル):
${CATALOG_TEXT}`;

/**
 * 自由文を解決して開くべき href（と応答・候補）を返す。
 * AI 呼び出しに失敗した場合は href=null を返し、呼び出し側（UI）が
 * 静的フィルタ等にフォールバックできるようにする（ナビを止めない）。
 */
export async function resolveNavIntent(query: string, opts?: { model?: string }): Promise<NavIntentResult> {
  const client = getAnthropicClient();
  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 512,
        // カタログを含む system はビルド時固定 → prompt caching 対象にできる。
        system: cacheableSystem(SYSTEM_PROMPT),
        messages: [{ role: "user", content: query }],
        output_config: { format: zodOutputFormat(NavIntentSchema) },
      }),
    );

    const out = msg.parsed_output;
    const href = resolveHrefFromCatalog(out?.href ?? null);
    const alternatives = (out?.alternatives ?? [])
      .map((h) => resolveHrefFromCatalog(h))
      .filter((h): h is string => h !== null && h !== href)
      .slice(0, 3);

    return { href, reply: out?.reply ?? "", alternatives };
  } catch (err) {
    console.error("[navIntent] error:", err);
    return { href: null, reply: "", alternatives: [] };
  }
}
