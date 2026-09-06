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
import ts from "typescript";
import { walkSource, handlerChunks, moduleChunk, stripComments } from "@/lib/__tests__/sourceScan";
import {
  parse,
  collect,
  calleeName,
  unwrapAwait,
  negated,
  alwaysExits,
  statementLists,
  declarationOf,
  hasExitingGuard,
  isIdent,
  isPropertyOf,
} from "@/lib/__tests__/astScan";

const SRC = join(process.cwd(), "src");
const API_ROOT = join(SRC, "app", "api");

/** Anthropic クライアントを実際に構築している = このモジュールはモデルを叩く。 */
const CALLS_MODEL = /getAnthropicClient\s*\(/;
/**
 * `checkRateLimit()` が**効いている**か。**構文木で見る。**
 *
 * 正規表現で3巡追いかけて、そのたびに形を変えた穴が出た（MISTAKE_LEDGER M-033）。
 *
 * ```
 * await checkRateLimit(...);                       // 結果を捨てる
 * if (!limited) return limited;                    // 弾く向きが逆
 * if (limited) logger.warn(); return callModel();  // return が if の外
 * if (a) { const limited = f(); if (limited) return limited; }
 * if (b) { const limited = f(); }                  // 同名・別スコープのガードを流用
 * void 0; // if (limited) return limited;          // コメントに書いてある
 * ```
 *
 * どれも木の上なら一行で落とせる。**同名の関数が2つある**ので、正しい向きは形で振り分ける。
 *   `@/lib/api/rateLimit` → `Response | null` : 返り値が**あるとき**に弾く
 *   `@/lib/rateLimit`     → `{ allowed, ... }` : `allowed` で**ないとき**に弾く
 */
/** AI を呼んでいる箇所の開始位置。レート制限がこれより前にあるかを見るために要る。 */
function aiCallStarts(node: ts.Node, bindings: readonly string[]): number[] {
  return collect(node, ts.isCallExpression)
    .filter((c) => bindings.includes(calleeName(c) ?? ""))
    .map((c) => c.getStart());
}

function rateLimitCalls(node: ts.Node): ts.CallExpression[] {
  return collect(node, ts.isCallExpression).filter((c) => calleeName(c) === "checkRateLimit");
}

function rateLimited(node: ts.Node, aiCallStarts: number[] = []): boolean {
  const total = rateLimitCalls(node).length;
  if (total === 0) return false;

  let guarded = 0;
  /** 弾き終わる位置。AI 呼び出しは**すべてこの後**でなければ意味が無い。 */
  const guardEnds: number[] = [];

  // (a) 変数に受けずその場で弾く形。`customer/line-login` が実際にこの書き方。
  for (const s of collect(node, ts.isIfStatement)) {
    if (rateLimitCalls(s.expression).length > 0 && alwaysExits(s.thenStatement)) {
      guarded += rateLimitCalls(s.expression).length;
      guardEnds.push(s.getEnd());
    }
  }

  // (b) 変数に受けて、**同じスコープの後ろの文**で弾く形。
  for (const stmts of statementLists(node)) {
    stmts.forEach((stmt, i) => {
      const decl = declarationOf(stmt);
      if (!decl || calleeName(unwrapAwait(decl.init)) !== "checkRateLimit") return;
      const v = decl.name;
      const rest = stmts.slice(i + 1);
      // `{ allowed }` を返す方か、`Response | null` を返す方か。使われ方で判る。
      const objectStyle = collect(node, ts.isPropertyAccessExpression).some((p) => isPropertyOf(p, v, "allowed"));
      const matches = (cond: ts.Expression) => {
        if (!objectStyle) return isIdent(cond, v);
        const inner = negated(cond);
        return inner !== null && isPropertyOf(inner, v, "allowed");
      };
      const guard = rest.find((st) => ts.isIfStatement(st) && matches(st.expression) && alwaysExits(st.thenStatement));
      if (guard) {
        guarded += 1;
        guardEnds.push(guard.getEnd());
      }
    });
  }

  // **数え漏らしを「制限あり」と読まない。** 知らない書き方は false に倒す。
  if (guarded < total) return false;

  // **弾いてから呼ぶ**ことまで見る。先にモデルを呼んでから制限しても、
  // 弾かれた要求は既に課金されている（Codex の指摘）。
  return aiCallStarts.every((at) => guardEnds.some((end) => end <= at));
}

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

/**
 * 課金の出る外部推論への別経路その1: ベンダー SDK のパッケージ名。
 *
 * 静的 import (`from "openai"`) だけでなく、動的 import (`await import("openai")`) と
 * `require("openai")` も拾う。**静的 import だけを見ると、遅延読み込みで書かれた
 * 2つ目のベンダーが素通りする**（PR #1027 の `/code-review` 指摘）。
 * 3つとも「区切り文字 + パッケージ名」の形なので、パッケージ名の側だけを列挙して
 * 引用符（`"` `'` バッククォート）を共通の前置きで受ける。
 */
const VENDOR_PACKAGES = [
  String.raw`openai(?:\/[^"'\x60]*)?`,
  String.raw`@google\/gen(?:erative-)?ai`,
  String.raw`@mistralai\/[^"'\x60]*`,
  String.raw`cohere-ai`,
  String.raw`groq-sdk`,
  String.raw`replicate`,
  String.raw`@aws-sdk\/client-bedrock[^"'\x60]*`,
];

/** `from "pkg"` / `import("pkg")` / `require("pkg")` を、引用符3種すべてで受ける。 */
const OTHER_INFERENCE_IMPORTS = VENDOR_PACKAGES.map(
  (pkg) => new RegExp(String.raw`(?:from|import|require)\s*\(?\s*["'\x60](?:${pkg})["'\x60]`),
);

/**
 * 別経路その2: SDK を通さず HTTP で直接叩く推論 API のホスト名。
 *
 * **正規表現ではなく平文の部分文字列で持つ。** ここで欲しいのは
 * 「ソースのどこかにこの文字列が出るか」であって URL の検証ではない。
 * アンカーの無いホスト名パターンを正規表現で書くと CodeQL の
 * `js/missing-regexp-anchor` が high として上げる（PR #1027 で実際に3件上がった）。
 * 検査の意図どおり `includes()` で書けば、警告は消えて挙動も変わらない。
 */
const INFERENCE_HOSTS = [
  "api.openai.com",
  "api.anthropic.com", // SDK を通さない生 fetch
  "generativelanguage.googleapis.com",
  "api.mistral.ai",
  "api.cohere.ai",
  "api.cohere.com",
];

/** そのファイルが、共通入口を通さない推論経路を持っているか。 */
function usesOtherInference(src: string): boolean {
  return OTHER_INFERENCE_IMPORTS.some((re) => re.test(src)) || INFERENCE_HOSTS.some((host) => src.includes(host));
}

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
  // ユーザーが叩ける経路ではない。呼び出し数は「opt-in 済みテナント数 × 1/日」で
  // 頭打ちになるので件数上限は要らない。2026-09-04 検証。
  "cron/daily-digest [GET]",
  // QStash 署名必須の非同期ジョブ。auth セッションが無くユーザーが直接叩けない。
  // 1回の実行の費用と実行時間の両方を件数上限（LINE_HISTORY_IMPORT_MAX、既定80）が
  // 抑える。リクエスト単位の制限はキューワーカーには意味を持たない。2026-09-04 検証。
  //
  // **どちらも月次コストキャップだけには頼っていない。** 2026-09-04 に既定が入り
  // （テナント1件あたり月1万円）設定が無くても効くようになったが、Redis 不在・
  // 失敗時は fail-open する。免除の根拠は上の構造の側。
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

// **コメントを落としてから走査する。** これが無いと、レート制限の呼び出しと
// ガードを丸ごとコメントアウトしただけのルートを「制限あり」と読む（Codex の指摘）。
const SOURCES = new Map<string, string>(
  walkSource(SRC).map((f) => [f, stripComments(readFileSync(f, "utf8"))] as const),
);

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
  const src = SOURCES.get(file) ?? stripComments(readFileSync(file, "utf8"));
  const bindings = aiBindings(file, src);
  if (!bindings.length) continue;
  const callsAi = (chunk: string) => bindings.some((b) => new RegExp(String.raw`(?<![\w.])${b}\s*\(`).test(chunk));

  const name = routeName(file);
  for (const [method, chunk] of handlerChunks(src)) {
    if (callsAi(chunk)) {
      const tree = parse(chunk, file);
      units.push({ id: `${name} [${method}]`, limited: rateLimited(tree, aiCallStarts(tree, bindings)) });
    }
  }
  // `export const POST = withX(handler)` の実体はここに落ちる。見落とすと消える。
  const top = moduleChunk(src);
  if (top && callsAi(top)) {
    const tree = parse(top, file);
    units.push({ id: `${name} [module]`, limited: rateLimited(tree, aiCallStarts(tree, bindings)) });
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
      .filter(([, src]) => usesOtherInference(src))
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

describe("検出器そのものの性質", () => {
  // 構造テストは「その語がソースにある」しか語れない。**述語を値で動かして**
  // 素通りする形が本当に false になることを確かめる（M-033・型 G）。
  const limited = (src: string) => rateLimited(parse(src));

  it("結果を捨てる書き方は「制限している」と見なさない", () => {
    expect(limited('const l = await checkRateLimit(req, "ai");')).toBe(false);
    expect(limited('const l = await checkRateLimit(req, "ai");\nif (l) return l;')).toBe(true);
  });

  it("弾く向きが逆なら「制限している」と見なさない", () => {
    // どちらも「通すべきを弾き、弾くべきを通す」壊れたガード（Codex の指摘）。
    expect(limited('const l = await checkRateLimit(req, "ai");\nif (!l) return l;')).toBe(false);
    expect(limited("const rl = await checkRateLimit(key, opts);\nif (rl.allowed) { return apiJson({}, 429); }")).toBe(
      false,
    );
  });

  it("`{ allowed }` を返すもう1つの checkRateLimit の形も受ける", () => {
    expect(limited("const rl = await checkRateLimit(key, opts);\nif (!rl.allowed) { return apiJson({}, 429); }")).toBe(
      true,
    );
  });

  it("弾く return が if の中にあることまで要求する", () => {
    // `if` の**外**の return を拾って素通りしていた（Codex の指摘）。
    expect(limited('const l = await checkRateLimit(req, "ai");\nif (l) logger.warn();\nreturn callModel();')).toBe(
      false,
    );
    expect(limited('const l = await checkRateLimit(req, "ai");\nif (l) { logger.warn(); return l; }')).toBe(true);
  });

  it("同名変数でも、別スコープのガードを流用しない", () => {
    // 片方のブロックだけがガードしている。もう片方は守られていない（Codex の指摘）。
    const src = `
      if (a) { const l = await checkRateLimit(req, "ai"); if (l) return l; }
      if (b) { const l = await checkRateLimit(req, "ai"); }
    `;
    expect(limited(src)).toBe(false);
  });

  it("その場で弾く形も受ける（変数に受けない書き方）", () => {
    // customer/line-login が実際にこの形。
    expect(limited('if (await checkRateLimit(req, "auth")) return backToLogin("rate_limited");')).toBe(true);
    expect(limited('if (await checkRateLimit(req, "auth")) logger.warn();\nreturn callModel();')).toBe(false);
  });

  it("弾いてから呼ぶことまで要求する", () => {
    // 先にモデルを呼んでから制限しても、弾かれた要求は既に課金されている（Codex の指摘）。
    const tree = (src: string) => parse(src);
    const before = 'const l = await checkRateLimit(req, "ai");\nif (l) return l;\nconst r = await gen(x);';
    const after = 'const r = await gen(x);\nconst l = await checkRateLimit(req, "ai");\nif (l) return l;';
    const starts = (src: string) =>
      collect(tree(src), ts.isCallExpression)
        .filter((c) => calleeName(c) === "gen")
        .map((c) => c.getStart());
    expect(rateLimited(tree(before), starts(before))).toBe(true);
    expect(rateLimited(tree(after), starts(after))).toBe(false);
  });

  it("知らない書き方は「制限している」と読まない", () => {
    // 数え漏らしを合格に倒すと、新しい書き方が入った瞬間に静かに穴が開く。
    expect(limited('const r = someWrapper(await checkRateLimit(req, "ai"));')).toBe(false);
  });

  it("コメントの中身は最初から見ない（構文木にコメントは無い）", () => {
    expect(limited('void 0; // const l = await checkRateLimit(req, "ai"); if (l) return l;')).toBe(false);
  });

  it("呼んでいないものを「制限している」と言わない", () => {
    expect(limited("const x = await somethingElse(req);")).toBe(false);
  });
});
