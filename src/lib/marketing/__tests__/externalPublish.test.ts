import { beforeEach, describe, expect, it, vi } from "vitest";

type Target = { owner: string; repo: string; branch: string; path: string };
const putRepoFile = vi.fn<(t: Target, content: string, message: string) => Promise<{ committed: boolean }>>(
  async () => ({ committed: true }),
);
const deleteRepoFile = vi.fn<(t: Target, message: string) => Promise<{ deleted: boolean }>>(async () => ({
  deleted: true,
}));

vi.mock("@/lib/github/contents", async () => {
  const actual = await vi.importActual<typeof import("../../github/contents")>("../../github/contents");
  return { ...actual, putRepoFile, deleteRepoFile };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const { syncExternalPost, removeExternalPost } = await import("../externalPublish");

const row = {
  site: "holy-inc",
  type: "news" as const,
  status: "published" as const,
  slug: "release",
  title: "新機能を公開しました",
  title_en: "Shipped a new feature",
  category: "プロダクト",
  excerpt: null,
  body: "",
  published_at: "2026-09-15T02:00:00.000Z",
};

beforeEach(() => {
  putRepoFile.mockClear();
  deleteRepoFile.mockClear();
});

describe("syncExternalPost", () => {
  it("Ledra の投稿では GitHub を一切触らない", async () => {
    const res = await syncExternalPost({ ...row, site: "ledra" });
    expect(res).toEqual({ ok: true, action: "none" });
    expect(putRepoFile).not.toHaveBeenCalled();
    expect(deleteRepoFile).not.toHaveBeenCalled();
  });

  it("公開なら相手リポジトリの正しいブランチへコミットする", async () => {
    const res = await syncExternalPost(row);
    expect(res).toEqual({ ok: true, action: "published", url: "https://holy-inc.jp/news" });
    const [target, content] = putRepoFile.mock.calls[0];
    expect(target).toMatchObject({
      owner: "holy-auto",
      repo: "holy-inc",
      branch: "main",
      path: "src/content/news/2026-09-release.md",
    });
    expect(content).toContain('titleEn: "Shipped a new feature"');
  });

  it("MobileWash は master ブランチ", async () => {
    await syncExternalPost({
      ...row,
      site: "mobilewash",
      type: "press",
      category: null,
      title_en: null,
      excerpt: "提携に関するお知らせです。",
    });
    expect(putRepoFile.mock.calls[0][0]).toMatchObject({ repo: "MobileWash", branch: "master" });
  });

  it("下書きに戻したら相手のファイルを消す（サイトから下げる）", async () => {
    const res = await syncExternalPost({ ...row, status: "draft" });
    expect(res).toEqual({ ok: true, action: "removed" });
    expect(putRepoFile).not.toHaveBeenCalled();
    expect(deleteRepoFile).toHaveBeenCalledTimes(1);
  });

  it("スラッグを変えたら、新しいファイルを置いて古いファイルを消す", async () => {
    await syncExternalPost(row, { slug: "old-slug", type: "news", published_at: row.published_at });
    expect(putRepoFile.mock.calls[0][0]).toMatchObject({ path: "src/content/news/2026-09-release.md" });
    expect(deleteRepoFile).toHaveBeenCalledTimes(1);
    expect(deleteRepoFile.mock.calls[0][0]).toMatchObject({ path: "src/content/news/2026-09-old-slug.md" });
  });

  it("置き場所が変わっていなければ古いファイルは消さない", async () => {
    await syncExternalPost(row, { slug: "release", type: "news", published_at: row.published_at });
    expect(deleteRepoFile).not.toHaveBeenCalled();
  });

  it("必須項目が足りなければ、どの項目かを返して公開しない", async () => {
    const res = await syncExternalPost({ ...row, title_en: null });
    expect(res).toEqual({ ok: false, field: "title_en", message: expect.stringContaining("英語タイトル") });
    expect(putRepoFile).not.toHaveBeenCalled();
  });

  it("コミットに失敗したら ok:false を返す（成功と言わない）", async () => {
    putRepoFile.mockRejectedValueOnce(new Error("boom"));
    const res = await syncExternalPost(row);
    expect(res.ok).toBe(false);
  });
});

describe("removeExternalPost", () => {
  it("一度も公開していない投稿では何もしない", async () => {
    const res = await removeExternalPost({ ...row, published_at: null });
    expect(res).toEqual({ ok: true, action: "none" });
    expect(deleteRepoFile).not.toHaveBeenCalled();
  });

  it("公開済みなら相手のファイルを消す", async () => {
    const res = await removeExternalPost(row);
    expect(res).toEqual({ ok: true, action: "removed" });
    expect(deleteRepoFile.mock.calls[0][0]).toMatchObject({ path: "src/content/news/2026-09-release.md" });
  });
});
