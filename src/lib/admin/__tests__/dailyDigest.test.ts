/**
 * dailyDigest (AIマネージャー) の単体テスト。
 *
 * 検証する契約:
 *   - buildDeterministicDigest: タイルの label+count だけで文を作り、数値を創作しない
 *   - 空タイル → 「急ぎタスクなし」の定型文
 *   - generateDailyDigest: APIキー無しなら決定論フォールバックに一致 (ai:false)
 *   - AI に渡す事実はタイル由来の件数のみ (creation の余地を与えない)
 *   - AI 成功時は要約文を返す (ai:true)、空応答は決定論フォールバック
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskTile } from "@/lib/admin/todayTasks";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock("@/lib/http/withRetry", () => ({
  withRetry: (_name: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => ({ messages: { parse: (...a: unknown[]) => parseMock(...a) } }),
  AI_MODEL_FAST: "fast",
}));

import { buildDeterministicDigest, generateDailyDigest } from "../dailyDigest";

const TILES: TaskTile[] = [
  {
    id: "in_progress_jobs",
    label: "作業中の案件",
    count: 2,
    hint: "進捗を更新してください",
    href: "/admin/reservations",
    tone: "urgent",
    priority: 0,
  },
  {
    id: "overdue_invoices",
    label: "期限超過の請求",
    count: 1,
    hint: "未回収です",
    href: "/admin/invoices",
    tone: "urgent",
    priority: 0,
  },
];

describe("buildDeterministicDigest", () => {
  it("空タイルは定型の『急ぎタスクなし』を返す", () => {
    const r = buildDeterministicDigest([]);
    expect(r.ai).toBe(false);
    expect(r.text).toContain("急ぎタスクはありません");
  });

  it("タイルの label と count だけで文を組み、余計な数値を出さない", () => {
    const r = buildDeterministicDigest(TILES);
    expect(r.ai).toBe(false);
    expect(r.text).toBe("本日の確認事項: 作業中の案件 2件、期限超過の請求 1件。");
    // タイルに無い数値が紛れ込んでいないこと (2 と 1 以外の数字が無い)
    expect(r.text.replace(/[21]/g, "").match(/\d/)).toBeNull();
  });
});

describe("generateDailyDigest", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("APIキー無しなら決定論フォールバックに一致する", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await generateDailyDigest(TILES);
    expect(r).toEqual(buildDeterministicDigest(TILES));
    expect(parseMock).not.toHaveBeenCalled();
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });

  it("AI へ渡す事実はタイル由来の件数のみで、成功時は要約を返す", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockResolvedValue({
      parsed_output: { summary: "作業中の案件2件と期限超過の請求1件を確認してください。" },
    });

    const r = await generateDailyDigest(TILES, { tenantName: "テスト店" });
    expect(r.ai).toBe(true);
    expect(r.text).toContain("確認してください");

    // モデルに渡した user content にタイルの件数が含まれ、事実源はタイルだけ
    const content = parseMock.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("作業中の案件: 2件");
    expect(content).toContain("期限超過の請求: 1件");
  });

  it("AI が空応答なら決定論フォールバックへ落ちる", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockResolvedValue({ parsed_output: { summary: "  " } });
    const r = await generateDailyDigest(TILES);
    expect(r).toEqual(buildDeterministicDigest(TILES));
  });
});
