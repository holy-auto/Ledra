/**
 * Marketing content loader.
 *
 * Reads `.mdx` files with YAML frontmatter from `src/content/<collection>/`
 * at build time. Frontmatter is parsed with a minimal built-in parser to
 * avoid adding dependencies at Phase 0. Replace with `gray-matter` in
 * Phase 2 when we add MDX rendering.
 *
 * Collections: `cases`, `news`, `blog`
 */

import fs from "node:fs/promises";
import path from "node:path";

export type ContentCollection = "cases" | "news" | "blog";

export type ContentFrontmatter = {
  title: string;
  slug: string;
  publishedAt?: string;
  excerpt?: string;
  tags?: string[];
  hero?: string;
  ogImage?: string;
  // case-specific
  company?: string;
  industry?: string;
  // blog/news specific
  author?: string;
  draft?: boolean;
  [key: string]: unknown;
};

export type ContentEntry = {
  frontmatter: ContentFrontmatter;
  body: string;
  sourcePath: string;
};

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");

/**
 * Minimal YAML frontmatter parser. Only supports string/boolean/list
 * values — enough for our use case. Falls back to treating everything
 * after the fence as body.
 */
function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const fenceMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fenceMatch) {
    return { data: {}, body: raw };
  }

  const [, yaml, body] = fenceMatch;
  const data: Record<string, unknown> = {};
  let currentListKey: string | null = null;

  for (const line of yaml.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentListKey) {
      const arr = (data[currentListKey] ??= []) as unknown[];
      arr.push(coerceScalar(listItem[1].trim()));
      continue;
    }

    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();

    if (value === "") {
      // Could be a list start
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = coerceScalar(value);
      currentListKey = null;
    }
  }

  return { data, body: body ?? "" };
}

function coerceScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Strip quotes if present
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function listContent(collection: ContentCollection): Promise<ContentEntry[]> {
  const dir = path.join(CONTENT_ROOT, collection);
  const files = (await safeReaddir(dir)).filter(
    // Files starting with `_` are conventionally treated as drafts/templates
    // and never exposed. Same for dotfiles and non-mdx files.
    (f) => !f.startsWith("_") && !f.startsWith(".") && (f.endsWith(".mdx") || f.endsWith(".md")),
  );

  const entries: ContentEntry[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const raw = await fs.readFile(full, "utf-8");
    const { data, body } = parseFrontmatter(raw);

    const slug = typeof data.slug === "string" && data.slug
      ? data.slug
      : file.replace(/\.mdx?$/, "");

    const frontmatter: ContentFrontmatter = {
      title: typeof data.title === "string" ? data.title : slug,
      slug,
      ...data,
    };

    if (frontmatter.draft === true && process.env.NODE_ENV === "production") continue;

    entries.push({ frontmatter, body, sourcePath: full });
  }

  // Sort by publishedAt desc (undefined at the end)
  entries.sort((a, b) => {
    const da = a.frontmatter.publishedAt ?? "";
    const db = b.frontmatter.publishedAt ?? "";
    if (da === db) return a.frontmatter.slug.localeCompare(b.frontmatter.slug);
    return db.localeCompare(da);
  });

  return entries;
}

export async function getContentBySlug(
  collection: ContentCollection,
  slug: string,
): Promise<ContentEntry | null> {
  const entries = await listContent(collection);
  return entries.find((e) => e.frontmatter.slug === slug) ?? null;
}
