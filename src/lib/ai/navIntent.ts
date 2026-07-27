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
import { adminCommandItems } from "@/components/ui/adminNav";

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
  searchQuery: z.string().nullable(),
  reply: z.string(),
  alternatives: z.array(z.string()),
});

export interface NavIntentResult {
  /** 開く画面（カタログ照合済み）。一致無しは null。 */
  href: string | null;
  /**
   * 特定エンティティ（顧客/車両/証明書/請求書）を探したい意図のときの検索語。
   * 例:「田中さんの情報」→「田中」。画面遷移の意図なら null。
   */
  searchQuery: string | null;
  /** 日本語1文の応答（「予約管理を開きます」等）。 */
  reply: string;
  /** 近い候補の href（カタログ照合済み・最大3件）。 */
  alternatives: string[];
}

const CATALOG_TEXT = CATALOG.map((c) => `${c.href}\t${c.label}${c.section ? `（${c.section}）` : ""}`).join("\n");

const SYSTEM_PROMPT = `あなたは Ledra 管理画面のナビゲーション補助です。
ユーザーの自由文を読み、(A) 画面を開く要望か、(B) 特定の相手/モノを探す要望か を判断します。

(A) 画面を開く要望（「予約を開いて」「先月の売上」など）:
- href に下の一覧の値をそのままコピーして返す。一覧に無いパスは創作しない。searchQuery は null。
- 十分に一致する画面が無ければ href は null、alternatives に近い候補の href を最大3件。

(B) 特定エンティティを探す要望（顧客・車両・証明書・請求書を名前や番号で確認したい）:
- 例:「田中さんの情報を確認したい」「ナンバー品川300の車」「車体番号ABC123の車両」「証明書LD-001」「帳票番号INV-2024の請求書」。
- href は null にし、searchQuery に検索語だけを入れる（相手/モノを特定する語。例「田中」「品川300」「ABC123」「LD-001」「INV-2024」）。
- 「〜の情報」「確認したい」などの語は除き、検索に効く語だけを searchQuery に入れる。

reply は日本語1文で、開く画面名 or 「『田中』を検索します」等を簡潔に述べる。

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
    // 画面が確定したらエンティティ検索はしない（href 優先）。
    const rawSearch = (out?.searchQuery ?? "").trim();
    const searchQuery = !href && rawSearch.length >= 2 ? rawSearch : null;

    return { href, searchQuery, reply: out?.reply ?? "", alternatives };
  } catch (err) {
    console.error("[navIntent] error:", err);
    return { href: null, searchQuery: null, reply: "", alternatives: [] };
  }
}
