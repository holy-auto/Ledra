/**
 * AI を呼ぶ API ハンドラにレート制限が入っていることを固定する。
 *
 * 認可（誰が呼べるか）は費用の上限にならない。staff 以上に絞っても、
 * 認証済みの1人がボタンを押し続ければ AI の課金は無制限に伸びる。
 *
 * 実際に抜けていた（2026-09-03）: `admin/academy/{cases,feedback,qa}`、
 * `admin/certificates/{ai-draft,ai-explain}`、`admin/purchase-orders/ai-message`、
 * `parts/installations/[id]/reconcile`、`vehicles/parse-shakken` の8本。
 *
 * ## この検出器は3回作り直している。教訓を埋め込んである。
 *
 * 1. **推移到達で洗ったら47本挙がった（不採用）。** `@/lib/ai/client` に辿り着けるかで
 *    見ると、`isMissingTableError`（エラー判定）や `calcSizeClass`（純粋な算術）まで
 *    拾う。**「到達できる」は「モデルを呼ぶ」ではない。**
 * 2. **ルート自身の `@/lib/ai/client` import で見たら29本になったが、狭すぎた（不採用）。**
 *    `parts/installations/[id]/reconcile` は `@/lib/ai/deliveryNoteOcr` 経由で
 *    Vision を叩くのに一覧から消え、**実際に無防備なまま見逃した**。
 *    検出器を狭めたときは、**一覧から消えたものを1件ずつ確認すること。**
 * 3. **ファイル単位で `checkRateLimit` を探すと素通りする（不採用）。**
 *    `admin/academy/cases` は GET に制限が無く POST にある。ファイル全体を見ると、
 *    ガードが間違ったハンドラに付いていても緑になる。
 *
 * 今の形: **モデルを叩くモジュールから import した binding を、ハンドラ単位で追う。**
 * 純粋関数・定数は `PURE_BINDINGS` に列挙して除く（すべて中身を読んで確認済み）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { walkSource, handlerChunks, moduleChunk } from "@/lib/__tests__/sourceScan";

const SRC = join(process.cwd(), "src");
const API_ROOT = join(SRC, "app", "api");

/** Anthropic クライアントを実際に構築している = このモジュールはモデルを叩く。 */
const CALLS_MODEL = /getAnthropicClient\s*\(/;
const RATE_LIMITED = /checkRateLimit\s*\(/;

/**
 * 上の `CALLS_MODEL` は「`getAnthropicClient()` が課金の出る外部推論の唯一の入口である」
 * という前提の上に成り立っている。別ベンダーの SDK を直接使う経路や、HTTP で外部の
 * 推論 API を叩く経路が入ると、**この検出器は黙って見落とす**（レート制限も剥がれる）。
 *
 * そこで前提を「守られているはず」から検査対象へ格上げする。下の2本のどちらかを
 * 破る PR は、レート制限の一覧に載らないまま緑になることができない。
 *
 * 別ベンダーを入れるときは、この定数を緩めるのではなく
 * `src/lib/ai/client.ts` に共通の入口を足して `CALLS_MODEL` をそこに向け直すこと。
 */
const VENDOR_CLIENT_CONSTRUCTION = /new\s+Anthropic\s*\(/;

/** 課金の出る外部推論への別経路（ベンダー SDK の import と、HTTP 直叩きのホスト名）。 */
const OTHER_INFERENCE_PATHS = [
  /from\s*"openai(?:\/[^"]*)?"/,
  /from\s*"@google\/gen(?:erative-)?ai"/,
  /from\s*"@mistralai\//,
  /from\s*"cohere-ai"/,
  /from\s*"groq-sdk"/,
  /from\s*"replicate"/,
  /from\s*"@aws-sdk\/client-bedrock/,
  /api\.openai\.com/,
  /api\.anthropic\.com/, // SDK を通さない生 fetch
  /generativelanguage\.googleapis\.com/,
  /api\.mistral\.ai/,
  /api\.cohere\.(?:ai|com)/,
];

/**
 * モデルを叩くモジュールから import されるが、**それ自体はモデルを呼ばない**もの。
 * すべて実装を読んで確認した。ここに足すときは必ず中身を読むこと
 * （形から推測して分類したのが MISTAKE_LEDGER 型 B）。
 */
const PURE_BINDINGS = new Set([
  "calcSizeClass", // 寸法から区分を出す算術
  "extractFirstRegistrationYear", // 和暦/西暦の文字列パース
  "isMissingTableError", // Postgres のエラーコード判定
  "toLineItems", // OCR 結果 → 明細への変換（呼び出し側で使う純関数）
  "parseShakenshoCode", // 車検証 QR の文字列パース（別モジュール shakensho-qr）
  "loadAiAutomationSettings", // テナント設定の読み出し
  "resolveAutoAction", // 設定から動作モードを決める分岐
  "isSourceAllowed", // 設定に対する述語
  "filterVehicleOcrByPolicy", // 生成済み結果のフィルタ
  "filterDraftByPolicy", // 同上
  "startAiRouteUsage", // 使用量の計測開始（モデルは呼ばない）
  "getCapturedUsage", // 計測結果の取り出し
  "modelForPlanTier", // モデル名を返すだけ
  "fastModelForPlanTier", // 同上
]);

/**
 * レート制限を課さないことに理由があるもの。
 * 増やすときは、なぜ**ユーザーが繰り返し叩けないのか**を書くこと。
 */
const EXEMPT = new Set([
  // cron 認証 + withCronLock(600s) の日次ジョブ（vercel.json: `0 22 * * *`）。
  // ユーザーが叩ける経路ではない。1テナント1日1回で、各テナントは自分の
  // 月次コストキャップ配下（超過で settings.enabled が false に倒れる）。
  // 件数上限は持たないが要らない（伸びる軸はテナント数だけ）。2026-09-04 検証。
  "cron/daily-digest [GET]",
  // QStash 署名必須の非同期ジョブ。auth セッションが無くユーザーが直接叩けない。
  // 費用を止めるのはループ内の月次コストキャップ判定。
  // 件数上限（LINE_HISTORY_IMPORT_MAX、既定80）は実行時間 maxDuration=300 秒の枠。
  // リクエスト単位の制限はキューワーカーには意味を持たない。2026-09-04 検証。
  "qstash/line-history-import [module]",
]);

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (SOURCES.has(cand)) return cand;
  }
  return null;
}

const SOURCES = new Map<string, string>(walkSource(SRC).map((f) => [f, readFileSync(f, "utf8")] as const));

/** モデルを叩くモジュール。 */
const MODEL_MODULES = new Set([...SOURCES].filter(([, src]) => CALLS_MODEL.test(src)).map(([f]) => f));

/** そのファイルが import している「モデルを呼ぶ関数」の名前。 */
function aiBindings(file: string, src: string): string[] {
  const names = new Set<string>();
  if (MODEL_MODULES.has(file)) names.add("getAnthropicClient");
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const target = resolveImport(m[2], file);
    if (!target || !MODEL_MODULES.has(target)) continue;
    for (const raw of m[1].split(",")) {
      const name = raw
        .replace(/\btype\b/, "")
        .split(" as ")
        .pop()!
        .trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      if (name === name.toUpperCase()) continue; // 定数
      if (PURE_BINDINGS.has(name)) continue;
      names.add(name);
    }
  }
  return [...names];
}

function routeName(file: string): string {
  return file
    .slice(API_ROOT.length + 1)
    .replace(/[\\/]route\.ts$/, "")
    .split(/[\\/]/)
    .join("/");
}

/** AI を呼ぶ「単位」= route + ハンドラ名（またはどのハンドラにも属さない module 断片）。 */
const units: { id: string; limited: boolean }[] = [];
for (const file of walkSource(API_ROOT, (f) => f.endsWith("route.ts"))) {
  const src = SOURCES.get(file) ?? readFileSync(file, "utf8");
  const bindings = aiBindings(file, src);
  if (!bindings.length) continue;
  const callsAi = (chunk: string) => bindings.some((b) => new RegExp(String.raw`(?<![\w.])${b}\s*\(`).test(chunk));

  const name = routeName(file);
  for (const [method, chunk] of handlerChunks(src)) {
    if (callsAi(chunk)) units.push({ id: `${name} [${method}]`, limited: RATE_LIMITED.test(chunk) });
  }
  // `export const POST = withX(handler)` の実体はここに落ちる。見落とすと消える。
  const top = moduleChunk(src);
  if (top && callsAi(top)) {
    units.push({ id: `${name} [module]`, limited: RATE_LIMITED.test(top) });
  }
}

describe("AI を呼ぶ API ハンドラのレート制限", () => {
  it("課金の出る外部推論の入口が `getAnthropicClient()` 1箇所に閉じている（検出器の前提）", () => {
    // ベンダークライアントの構築は共通入口だけ。ここが増えると CALLS_MODEL が届かない。
    const constructing = [...SOURCES]
      .filter(([, src]) => VENDOR_CLIENT_CONSTRUCTION.test(src))
      .map(([f]) =>
        f
          .slice(SRC.length + 1)
          .split(/[\\/]/)
          .join("/"),
      )
      .sort();
    expect(constructing).toEqual(["lib/ai/client.ts"]);

    // 別ベンダー SDK / HTTP 直叩きは 1 件も無い。
    const others = [...SOURCES]
      .filter(([, src]) => OTHER_INFERENCE_PATHS.some((re) => re.test(src)))
      .map(([f]) =>
        f
          .slice(SRC.length + 1)
          .split(/[\\/]/)
          .join("/"),
      )
      .sort();
    expect(others).toEqual([]);
  });

  it("検出器が空振りしていない", () => {
    // 検出器が壊れて空になると、下の検査が素通りで緑になる。
    // 件数の下限だけだと数本消えても気づけないので、性質の違う既知の経路を名指しする。
    expect(units.length).toBeGreaterThan(40);
    const ids = units.map((u) => u.id);
    for (const known of [
      "admin/certificates/ai-quality [POST]", // ルート自身が client を import
      "parts/installations/[id]/reconcile [POST]", // 下位モジュール経由（2の教訓）
      "vehicles/parse-shakken [POST]", // 下位モジュール経由（同上）
      "qstash/line-history-import [module]", // 包んで export する形（同上）
      "admin/academy/cases [POST]", // 同じファイルの GET は AI を呼ばない（3の教訓）
    ]) {
      expect(ids).toContain(known);
    }
    // GET は AI を呼ばないので単位に入ってはいけない（入ると PURE の判定が壊れている）。
    expect(ids).not.toContain("admin/academy/cases [GET]");
  });

  it("AI を呼ぶハンドラは、免除されていない限りレート制限を課している", () => {
    const missing = units
      .filter((u) => !u.limited && !EXEMPT.has(u.id))
      .map((u) => u.id)
      .sort();
    expect(missing).toEqual([]);
  });

  it("免除リストに、もう不要なものが残っていない（棚卸しの取りこぼしを防ぐ）", () => {
    const byId = new Map(units.map((u) => [u.id, u]));
    const stale = [...EXEMPT]
      .filter((id) => {
        const unit = byId.get(id);
        // 一覧から消えた（AI を呼ばなくなった）か、制限が入ったなら免除は不要。
        return !unit || unit.limited;
      })
      .sort();
    expect(stale).toEqual([]);
  });
});
