#!/usr/bin/env tsx
/**
 * audit-withRetry — 外部サービス呼び出しが withRetry を経由しているか検査する。
 *
 * 検査対象 (外部 SDK / REST 呼び出し):
 *   - Anthropic SDK (`client.messages.create|parse|stream`)
 *   - LINE API (`api.line.me`)
 *   - Resend REST (`api.resend.com`)
 *   - SendGrid REST (`api.sendgrid.com`)
 *   - Twilio REST (`api.twilio.com`)
 *   - Cloudflare API (`api.cloudflare.com`)
 *   - Polygon viem (`readContract`/`getLogs`/`waitForTransactionReceipt`)
 *   - gBizINFO (`info.gbiz.go.jp`)
 *   - Slack Webhook (`hooks.slack.com`)
 *   - Square API (`connect.squareup.com`)
 *   - freee / MF (`api.freee.co.jp`, `expense.moneyforward.com`)
 *   - Google Calendar (`googleapis.com/calendar`)
 *
 * 判定:
 *   - 上記パターンを含むファイルが、同ファイル内のどこかで `withRetry(` を
 *     経由していれば OK (簡易判定、関数スコープまでは見ない)
 *   - test ファイル / Proxy で自動ラップ対象 (Stripe) は除外
 *
 * 使い方:
 *   npm run audit:retry        # 違反があれば exit 1
 *   tsx scripts/audit-withRetry.ts
 *
 * 退行防止用なので CI に組み込むことを推奨。
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

interface Rule {
  /** human-readable identifier */
  name: string;
  /** content pattern that signals a relevant call site */
  pattern: RegExp;
  /** files matching here are skipped (e.g. tests, the wrapper itself) */
  skipFiles?: RegExp[];
}

const RULES: Rule[] = [
  {
    name: "Anthropic SDK",
    pattern: /\bclient\.messages\.(create|parse|stream)\b|\bmessages\.parse\(\s*{/,
    skipFiles: [/__tests__/, /src\/lib\/ai\/client\.ts$/],
  },
  { name: "LINE API", pattern: /api\.line\.me\//, skipFiles: [/__tests__/] },
  {
    name: "Resend REST",
    pattern: /api\.resend\.com\//,
    skipFiles: [/__tests__/, /src\/lib\/email\/resendSend\.ts$/],
  },
  { name: "SendGrid REST", pattern: /api\.sendgrid\.com\//, skipFiles: [/__tests__/] },
  { name: "Twilio REST", pattern: /api\.twilio\.com\//, skipFiles: [/__tests__/] },
  { name: "Cloudflare API", pattern: /api\.cloudflare\.com\//, skipFiles: [/__tests__/] },
  { name: "gBizINFO", pattern: /info\.gbiz\.go\.jp\//, skipFiles: [/__tests__/] },
  { name: "Slack Webhook", pattern: /hooks\.slack\.com\//, skipFiles: [/__tests__/] },
  { name: "Square API", pattern: /connect\.squareup\.com\//, skipFiles: [/__tests__/] },
  { name: "freee API", pattern: /api\.freee\.co\.jp\//, skipFiles: [/__tests__/] },
  { name: "MF API", pattern: /expense\.moneyforward\.com\//, skipFiles: [/__tests__/] },
  { name: "Google Calendar", pattern: /googleapis\.com\/calendar/, skipFiles: [/__tests__/] },
  {
    name: "Polygon viem",
    pattern: /\.(readContract|getLogs|waitForTransactionReceipt)\(/,
    skipFiles: [/__tests__/, /src\/lib\/anchoring\/providers\/polygon\.ts$/],
  },
];

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  file: string;
  rule: string;
  line: number;
  content: string;
}

function audit(): Violation[] {
  const files = walk(SRC_DIR);
  const violations: Violation[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const hasWithRetry = /\bwithRetry\(/.test(content);

    for (const rule of RULES) {
      if (rule.skipFiles?.some((re) => re.test(file))) continue;

      const lines = content.split("\n");
      let firstMatchLine = -1;
      let firstMatchContent = "";
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          firstMatchLine = i + 1;
          firstMatchContent = lines[i].trim();
          break;
        }
      }
      if (firstMatchLine === -1) continue;
      if (hasWithRetry) continue;

      violations.push({
        file: relative(ROOT, file),
        rule: rule.name,
        line: firstMatchLine,
        content: firstMatchContent.slice(0, 200),
      });
    }
  }
  return violations;
}

const violations = audit();

const STRICT = process.argv.includes("--strict");

if (violations.length === 0) {
  console.log("✅ All external API call sites are within files that use withRetry.");
  console.log("   (Stripe は src/lib/stripe/client.ts の Proxy で自動ラップされるため対象外)");
  process.exit(0);
}

const warnPrefix = STRICT ? "❌" : "⚠";
console.error(`${warnPrefix} Found ${violations.length} external API call site(s) in files without withRetry:`);
console.error("");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(`    ${v.content}`);
}
console.error("");
console.error("対応案:");
console.error("  - 該当ファイル内で withRetry(...) を経由するように改修");
console.error("  - Resend 直接 fetch は src/lib/email/sendEmail.ts (Resend → SendGrid フォールバック付き) に移行");
console.error("  - 共通ヘルパー対象外の SDK は scripts/audit-withRetry.ts の RULES.skipFiles に追加");
console.error("");
console.error("これらは既知の baseline 違反 (依存マトリクス §4 G14 参照)。");
console.error("今 PR では検出のみ、修正は順次別 PR で対応。");

// default: warn only (exit 0). CI で blocking したい時は --strict を渡す。
process.exit(STRICT ? 1 : 0);
