/**
 * GitHub のファイル1本を読み書きする最小クライアント（Contents API）。
 *
 * 用途は1つだけ: 管理画面から外部サイト（holy-inc / MobileWash）へ記事の md を
 * コミットすること。相手は静的サイトで、push で Vercel が再ビルドする。
 *
 * ponytail: 依存を足さずに fetch で叩く素朴な実装。1ファイルずつのコミットなので
 * 競合検知は Contents API の sha 任せ。複数ファイルを1コミットにまとめたくなったら
 * Git Data API（tree/commit）に作り替える。
 */
import { logger } from "@/lib/logger";

const API = "https://api.github.com";

export class GitHubContentError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubContentError";
    this.status = status;
  }
}

type Target = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

function token(): string {
  const t = process.env.GITHUB_CONTENT_TOKEN?.trim();
  if (!t) {
    throw new GitHubContentError(
      "GITHUB_CONTENT_TOKEN が未設定です。外部サイトへの公開にはリポジトリへの書き込み権限が要ります。",
      0,
    );
  }
  return t;
}

async function call(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

function contentsUrl({ owner, repo, path }: Target): string {
  // パスは既にリポジトリ内の相対パス。セグメントごとにエンコードする（/ は残す）。
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${owner}/${repo}/contents/${encoded}`;
}

async function fail(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => "");
  logger.error("github contents api failed", { what, status: res.status, body: text.slice(0, 500) });
  throw new GitHubContentError(`${what}に失敗しました（GitHub: ${res.status}）。`, res.status);
}

/** 既存ファイルの sha と中身。無ければ null。 */
async function currentFile(target: Target): Promise<{ sha: string; content: string } | null> {
  const res = await call("GET", `${contentsUrl(target)}?ref=${encodeURIComponent(target.branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) return fail(res, "ファイルの確認");
  const json = (await res.json()) as { sha?: string; content?: string; encoding?: string };
  if (!json.sha) return null;
  const content =
    json.encoding === "base64" && json.content ? Buffer.from(json.content, "base64").toString("utf8") : "";
  return { sha: json.sha, content };
}

/** ファイルを作成または更新する。内容が同じなら何もしない。 */
export async function putRepoFile(target: Target, content: string, message: string): Promise<{ committed: boolean }> {
  const existing = await currentFile(target);
  // 同じ内容の再コミットで空の履歴を増やさない
  if (existing && existing.content === content) return { committed: false };

  const res = await call("PUT", contentsUrl(target), {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: target.branch,
    ...(existing ? { sha: existing.sha } : {}),
  });
  if (!res.ok) return fail(res, "ファイルの保存");
  return { committed: true };
}

/** ファイルを削除する。元から無ければ何もしない。 */
export async function deleteRepoFile(target: Target, message: string): Promise<{ deleted: boolean }> {
  const existing = await currentFile(target);
  if (!existing) return { deleted: false };

  const res = await call("DELETE", contentsUrl(target), { message, sha: existing.sha, branch: target.branch });
  if (!res.ok) return fail(res, "ファイルの削除");
  return { deleted: true };
}
