import { describe, it, expect } from "vitest";
import { WEBHOOK_TOPICS, WEBHOOK_TOPIC_LABELS, isValidWebhookTopic } from "@/lib/webhook-topics";

describe("webhook-topics", () => {
  it("accepts wildcard", () => {
    expect(isValidWebhookTopic("*")).toBe(true);
  });

  it("accepts every registered topic", () => {
    for (const t of WEBHOOK_TOPICS) expect(isValidWebhookTopic(t)).toBe(true);
  });

  it("rejects unknown topics", () => {
    expect(isValidWebhookTopic("customer.deleted")).toBe(false);
    expect(isValidWebhookTopic("")).toBe(false);
    expect(isValidWebhookTopic("random")).toBe(false);
  });

  it("has a label for every topic", () => {
    for (const t of WEBHOOK_TOPICS) {
      expect(WEBHOOK_TOPIC_LABELS[t]).toBeTruthy();
    }
  });

  it("includes the ingest sync topics", () => {
    expect(WEBHOOK_TOPICS).toContain("customer.created");
    expect(WEBHOOK_TOPICS).toContain("customer.updated");
    expect(WEBHOOK_TOPICS).toContain("vehicle.created");
    expect(WEBHOOK_TOPICS).toContain("vehicle.updated");
    expect(WEBHOOK_TOPICS).toContain("work_history.created");
  });
});
