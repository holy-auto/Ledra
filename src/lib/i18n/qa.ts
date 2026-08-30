/**
 * IMP-051: 翻訳品質保証ユーティリティ（v2.0 §3.5）。
 *
 * メッセージファイル・用語集・ドメインラベルの網羅性・整合性を
 * 検証する純関数群。CI テストから呼び出して翻訳抜けを検出する。
 *
 * 純関数。IO なし。
 */

import type { MessageTree } from "./messages";
import { lookup } from "./messages";

// ── 型定義 ──

export interface MissingTranslation {
  locale: string;
  key: string;
}

export interface PlaceholderMismatch {
  key: string;
  locale: string;
  /** ベースロケールにあるが対象ロケールにないプレースホルダ */
  missing: string[];
  /** 対象ロケールにあるがベースロケールにないプレースホルダ */
  extra: string[];
}

export interface TranslationCoverage {
  /** ロケール別カバレッジ（0–100） */
  perLocale: Record<string, { total: number; translated: number; percent: number }>;
  /** 全ロケール平均（0–100） */
  overallPercent: number;
}

// ── ヘルパー ──

/** MessageTree からドットパスのフラットキー集合を抽出 */
function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      keys.push(path);
    } else {
      keys.push(...flattenKeys(v, path));
    }
  }
  return keys;
}

/** テンプレート文字列から {name} プレースホルダを抽出 */
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)).sort() : [];
}

// ── 翻訳抜け検出 ──

/**
 * 全ロケール間でキーの過不足を検出する。
 *
 * 全ロケールのキー和集合を求め、各ロケールに存在しないキーを報告。
 */
export function findMissingTranslations(messages: Record<string, MessageTree>): MissingTranslation[] {
  const locales = Object.keys(messages);
  const allKeySets = locales.map((l) => new Set(flattenKeys(messages[l])));
  const unionKeys = new Set(allKeySets.flatMap((s) => [...s]));

  const missing: MissingTranslation[] = [];
  for (let i = 0; i < locales.length; i++) {
    for (const key of unionKeys) {
      if (!allKeySets[i].has(key)) {
        missing.push({ locale: locales[i], key });
      }
    }
  }
  return missing;
}

// ── プレースホルダ整合性 ──

/**
 * ベースロケールとの {var} プレースホルダの不一致を検出。
 *
 * ベースロケール（通常 ja）のプレースホルダを正とし、
 * 他ロケールで過不足があれば報告。
 */
export function findPlaceholderMismatches(
  messages: Record<string, MessageTree>,
  baseLocale: string,
): PlaceholderMismatch[] {
  const baseTree = messages[baseLocale];
  if (!baseTree) return [];

  const baseKeys = flattenKeys(baseTree);
  const mismatches: PlaceholderMismatch[] = [];

  for (const [locale, tree] of Object.entries(messages)) {
    if (locale === baseLocale) continue;
    for (const key of baseKeys) {
      const baseVal = lookup(baseTree, key);
      const localeVal = lookup(tree, key);
      // undefined（キー自体が無い）のみスキップする。空文字は「翻訳が
      // 空になっている」実際の不一致なので、プレースホルダ比較にかける。
      if (baseVal === undefined || localeVal === undefined) continue;

      const basePh = extractPlaceholders(baseVal);
      const localePh = extractPlaceholders(localeVal);

      const missingPh = basePh.filter((p) => !localePh.includes(p));
      const extraPh = localePh.filter((p) => !basePh.includes(p));

      if (missingPh.length > 0 || extraPh.length > 0) {
        mismatches.push({ key, locale, missing: missingPh, extra: extraPh });
      }
    }
  }
  return mismatches;
}

// ── カバレッジ計算 ──

/**
 * ロケール別の翻訳カバレッジを計算。
 *
 * 全ロケールのキー和集合を母数とし、各ロケールの充足率を算出。
 */
export function computeTranslationCoverage(messages: Record<string, MessageTree>): TranslationCoverage {
  const locales = Object.keys(messages);
  const perLocaleKeys = locales.map((l) => new Set(flattenKeys(messages[l])));
  const allKeys = new Set(perLocaleKeys.flatMap((s) => [...s]));
  const total = allKeys.size;

  const perLocale: TranslationCoverage["perLocale"] = {};
  let sumPercent = 0;

  locales.forEach((locale, i) => {
    const keys = perLocaleKeys[i];
    const translated = [...allKeys].filter((k) => keys.has(k)).length;
    const percent = total > 0 ? Math.round((translated / total) * 10000) / 100 : 100;
    perLocale[locale] = { total, translated, percent };
    sumPercent += percent;
  });

  return {
    perLocale,
    overallPercent: locales.length > 0 ? Math.round((sumPercent / locales.length) * 100) / 100 : 100,
  };
}

// ── 用語集カバレッジ ──

export interface GlossaryGap {
  term: string;
  missingLocales: string[];
}

/**
 * 用語集エントリから翻訳欠落を検出。
 *
 * 各エントリに ja + en が必須、他ロケールは任意だが欠落は報告。
 */
export function findGlossaryGaps(
  glossary: Record<string, { ja: string; en: string; [locale: string]: string | undefined }[]>,
  expectedLocales: readonly string[],
): GlossaryGap[] {
  const gaps: GlossaryGap[] = [];
  for (const [category, entries] of Object.entries(glossary)) {
    for (const entry of entries) {
      const missing = expectedLocales.filter((l) => !entry[l]);
      if (missing.length > 0) {
        gaps.push({ term: `${category}:${entry.ja}`, missingLocales: missing });
      }
    }
  }
  return gaps;
}
