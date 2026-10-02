import { describe, expect, it } from "vitest";
import { fromCloudflareEdge } from "../edgeOrigin";

const req = (secret?: string) =>
  new Request("https://example.test/", { headers: secret === undefined ? {} : { "x-ledra-origin-secret": secret } });

describe("fromCloudflareEdge", () => {
  it("is false when no secret is configured, even if the header is sent", () => {
    expect(fromCloudflareEdge(req("anything"), undefined)).toBe(false);
    expect(fromCloudflareEdge(req(""), "")).toBe(false);
  });
  it("is true only for an exact match", () => {
    expect(fromCloudflareEdge(req("s3cret"), "s3cret")).toBe(true);
    expect(fromCloudflareEdge(req(), "s3cret")).toBe(false);
    expect(fromCloudflareEdge(req("s3creT"), "s3cret")).toBe(false);
    expect(fromCloudflareEdge(req("s3cre"), "s3cret")).toBe(false);
  });
});
