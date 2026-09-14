import { describe, it, expect } from "vitest";
import { foldThreads, threadKeyOf } from "@/lib/messages/threads";

type Row = Parameters<typeof foldThreads>[0][number];

/** created_at 降順で渡す前提（実装が「最初に見たものが最新」に依存している）。 */
function row(over: Partial<Row> & { created_at: string }): Row {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    customer_id: null,
    line_user_id: null,
    email_from: null,
    channel: "line",
    direction: "inbound",
    body: "",
    read_at: null,
    delivered_at: null,
    failed_at: null,
    ai_extracted: null,
    ...over,
  } as Row;
}

describe("threadKeyOf", () => {
  it("prefers customer_id, then line_user_id, then email_from", () => {
    expect(threadKeyOf({ customer_id: "c1", line_user_id: "U1", email_from: "a@b.com" })).toBe("c:c1");
    expect(threadKeyOf({ customer_id: null, line_user_id: "U1", email_from: "a@b.com" })).toBe("l:U1");
    expect(threadKeyOf({ customer_id: null, line_user_id: null, email_from: "a@b.com" })).toBe("e:a@b.com");
  });

  it("returns null when the row cannot be attributed to any thread", () => {
    expect(threadKeyOf({ customer_id: null, line_user_id: null, email_from: null })).toBeNull();
  });
});

describe("foldThreads", () => {
  it("keeps the newest message as the thread preview", () => {
    const threads = foldThreads([
      row({ customer_id: "c1", body: "newest", created_at: "2026-08-23T03:00:00Z" }),
      row({ customer_id: "c1", body: "older", created_at: "2026-08-23T01:00:00Z" }),
    ]);
    const t = threads.get("c:c1")!;
    expect(t.last_body).toBe("newest");
    expect(t.last_created_at).toBe("2026-08-23T03:00:00Z");
    expect(t.message_count).toBe(2);
  });

  it("counts only unread inbound messages", () => {
    const threads = foldThreads([
      row({ customer_id: "c1", direction: "inbound", read_at: null, created_at: "2026-08-23T03:00:00Z" }),
      row({
        customer_id: "c1",
        direction: "inbound",
        read_at: "2026-08-23T02:30:00Z",
        created_at: "2026-08-23T02:00:00Z",
      }),
      // outbound は read_at が無くても未読ではない（自分が送ったもの）
      row({ customer_id: "c1", direction: "outbound", read_at: null, created_at: "2026-08-23T01:00:00Z" }),
    ]);
    expect(threads.get("c:c1")!.unread_count).toBe(1);
  });

  it("splits the same LINE user into two threads once a customer gets linked", () => {
    // 会話の途中で顧客に紐付いた場合、紐付く前の行は customer_id が NULL のままなので
    // l: と c: の 2 スレッドに分かれる。一覧では 2 行に見えるが、どちらを開いても
    // resolveThread + fetchThreadMessages が両方の行を集めるので会話は 1 本に戻る。
    // 既存の受信箱と同じ挙動。ここを変えると管理画面の一覧も変わる。
    const threads = foldThreads([
      row({ line_user_id: "U1", customer_id: "c1", created_at: "2026-08-23T03:00:00Z" }),
      row({ line_user_id: "U1", created_at: "2026-08-23T01:00:00Z" }),
    ]);
    expect(Array.from(threads.keys()).sort()).toEqual(["c:c1", "l:U1"]);
    // customer スレッド側には line_user_id が載るので、そのまま返信先にできる
    expect(threads.get("c:c1")!.line_user_id).toBe("U1");
  });

  it("drops rows with no customer, line user or email", () => {
    expect(foldThreads([row({ created_at: "2026-08-23T03:00:00Z" })]).size).toBe(0);
  });

  it("counts only unhandled reservation candidates", () => {
    const threads = foldThreads([
      row({ customer_id: "c1", ai_extracted: { intent: "new_reservation" }, created_at: "2026-08-23T04:00:00Z" }),
      row({ customer_id: "c1", ai_extracted: { intent: "change_reservation" }, created_at: "2026-08-23T03:00:00Z" }),
      // 対応済みは数えない
      row({
        customer_id: "c1",
        ai_extracted: { intent: "new_reservation", handled_at: "2026-08-23T02:30:00Z" },
        created_at: "2026-08-23T02:00:00Z",
      }),
      // 予約系でない intent は数えない
      row({ customer_id: "c1", ai_extracted: { intent: "question" }, created_at: "2026-08-23T01:00:00Z" }),
    ]);
    expect(threads.get("c:c1")!.candidate_count).toBe(2);
  });
});
