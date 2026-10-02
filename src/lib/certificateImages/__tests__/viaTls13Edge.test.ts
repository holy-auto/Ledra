import { describe, expect, it } from "vitest";
import { viaTls13Edge } from "../uploadHandler";

const req = (secret?: string) =>
  new Request("https://example.test/api/certificates/images/upload", {
    headers: secret === undefined ? {} : { "x-ledra-origin-secret": secret },
  });

describe("viaTls13Edge", () => {
  it("is a no-op when CF_ORIGIN_SECRET is not configured (no Cloudflare in front)", () => {
    expect(viaTls13Edge(req(), undefined)).toBe(true);
  });
  it("accepts only requests carrying the edge secret once configured", () => {
    expect(viaTls13Edge(req("s3cret"), "s3cret")).toBe(true);
    expect(viaTls13Edge(req(), "s3cret"), "direct *.vercel.app hit, no header").toBe(false);
    expect(viaTls13Edge(req("wrong!"), "s3cret"), "same length, wrong value").toBe(false);
    expect(viaTls13Edge(req("s3cre"), "s3cret"), "different length").toBe(false);
  });
});
