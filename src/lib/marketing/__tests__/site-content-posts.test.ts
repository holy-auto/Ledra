import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 同じテーブルに holy-inc / MobileWash 向けの投稿も入る。site で絞り忘れると
 * 他社サイトのお知らせが Ledra の /news・sitemap・RSS に出てしまうので、
 * 絞っていることをクエリの組み立てで確かめる。
 */
const calls: Array<[string, unknown[]]> = [];

function chain() {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  const builder: Record<string, unknown> = {
    select: record("select"),
    eq: record("eq"),
    in: record("in"),
    order: record("order"),
    limit: (...args: unknown[]) => {
      calls.push(["limit", args]);
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: () => chain() }),
}));

const { listPublishedPosts, getPublishedPostBySlug } = await import("../site-content-posts");

const eqArgs = () => calls.filter(([name]) => name === "eq").map(([, args]) => args);

beforeEach(() => {
  calls.length = 0;
});

describe("公開読み取りは Ledra の投稿だけを読む", () => {
  it("listPublishedPosts が site='ledra' で絞る", async () => {
    await listPublishedPosts(["news"]);
    expect(eqArgs()).toContainEqual(["site", "ledra"]);
    expect(eqArgs()).toContainEqual(["status", "published"]);
  });

  it("getPublishedPostBySlug も site='ledra' で絞る", async () => {
    await getPublishedPostBySlug("blog", "example");
    expect(eqArgs()).toContainEqual(["site", "ledra"]);
  });
});
