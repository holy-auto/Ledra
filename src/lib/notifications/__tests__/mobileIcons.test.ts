/**
 * 通知タイプカタログとモバイルのアイコン表のズレを検出する（IMP-029）。
 *
 * 実際に壊れていた例（2026-08-31 に発見）: モバイルの通知一覧
 * (`apps/mobile/src/app/notifications.tsx`) のアイコン表のキーは
 * certificate / work / sync / error / system だったが、DB に書かれる
 * `notification_type` は ai_action / chat_message / platform_notification で、
 * **1つも一致していなかった**。本番の通知60件（chat_message 56 / ai_action 4、
 * 2026-07-05〜08-27）が全部デフォルトのベルアイコンで表示されていた。
 *
 * モバイルは Web の `src/lib` を import できない（`apps/mobile/tsconfig.json` の
 * `@/*` は `apps/mobile/src` のみ）ため、表はモバイル側に持たざるを得ない。
 * そのぶんズレは静かに起きるので、ここで機械的に照合する。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTIFICATION_TYPE_CATALOG, isNotificationType } from "../types";
import { walkSource } from "../../__tests__/sourceScan";

const MOBILE_SCREEN = join(process.cwd(), "apps", "mobile", "src", "app", "notifications.tsx");

/** モバイルの TYPE_ICON のキー集合を、ソースから読み取る。 */
function mobileIconKeys(): string[] {
  const src = readFileSync(MOBILE_SCREEN, "utf8");
  const start = src.indexOf("const TYPE_ICON");
  expect(start, "TYPE_ICON がモバイル画面に見つからない（改名された？）").toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\n};", start));
  return [...body.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
}

describe("通知タイプカタログとモバイルのアイコン表", () => {
  const catalogTypes = Object.keys(NOTIFICATION_TYPE_CATALOG);
  const iconKeys = mobileIconKeys();

  it("読み取り自体が成立している（空で合格するのを防ぐ）", () => {
    // 件数そのものは固定しない。タイプが増えるのは正常な変化で、
    // 増減の検出は下の2つの集合一致テストが行う。
    expect(catalogTypes.length).toBeGreaterThanOrEqual(18);
    expect(iconKeys.length).toBeGreaterThanOrEqual(18);
  });

  it("カタログの全タイプにアイコンがある", () => {
    expect(catalogTypes.filter((t) => !iconKeys.includes(t))).toEqual([]);
  });

  it("アイコン表に未知のタイプが無い", () => {
    expect(iconKeys.filter((k) => !catalogTypes.includes(k))).toEqual([]);
  });
});

// ── 書き込み側 ──

const SRC_ROOT = join(process.cwd(), "src");

describe("notifications へ書き込む notification_type", () => {
  /** `notification_type: "x"` のリテラル書き込みを集める（比較 `=== "x"` は拾わない）。 */
  const written = new Map<string, string>();
  for (const file of walkSource(SRC_ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!/from\("notifications"\)/.test(src)) continue;
    for (const m of src.matchAll(/notification_type:\s*"([a-z_]+)"/g)) {
      written.set(m[1], file.slice(SRC_ROOT.length + 1));
    }
  }

  it("書き込み経路を検出できている", () => {
    expect(written.size).toBeGreaterThanOrEqual(3);
  });

  it("書き込まれる型はすべてカタログに載っている（UI が描画できる）", () => {
    const unknown = [...written].filter(([t]) => !isNotificationType(t)).map(([t, f]) => `${t} (${f})`);
    expect(unknown).toEqual([]);
  });
});
