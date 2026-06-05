import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkImageFetchUrl,
  assertImageFetchUrl,
  partitionImageFetchUrls,
  SsrfBlockedError,
} from "@/lib/security/urlAllowlist";

describe("urlAllowlist (SSRF guard)", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ORIGINAL_EXTRA = process.env.SSRF_ALLOWED_IMAGE_HOSTS;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd1234.supabase.co";
    delete process.env.SSRF_ALLOWED_IMAGE_HOSTS;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL;
    if (ORIGINAL_EXTRA === undefined) delete process.env.SSRF_ALLOWED_IMAGE_HOSTS;
    else process.env.SSRF_ALLOWED_IMAGE_HOSTS = ORIGINAL_EXTRA;
  });

  it("allows Supabase Storage URLs", () => {
    const res = checkImageFetchUrl("https://abcd1234.supabase.co/storage/v1/object/public/photos/t/c/x.jpg");
    expect(res.ok).toBe(true);
  });

  it("rejects OTHER supabase projects (not the app's own host)", () => {
    // Only the project host from NEXT_PUBLIC_SUPABASE_URL is allowed; a
    // different *.supabase.co project (e.g. attacker-controlled Edge Function)
    // must NOT pass.
    expect(checkImageFetchUrl("https://attacker.supabase.co/x.jpg")).toMatchObject({
      ok: false,
      reason: "host_not_allowlisted",
    });
    expect(checkImageFetchUrl("https://proj.supabase.in/x.jpg")).toMatchObject({
      ok: false,
      reason: "host_not_allowlisted",
    });
  });

  it("rejects cloud metadata IP", () => {
    const res = checkImageFetchUrl("https://169.254.169.254/latest/meta-data/");
    expect(res).toMatchObject({ ok: false, reason: "ip_literal_not_allowed" });
  });

  it("rejects localhost and loopback", () => {
    expect(checkImageFetchUrl("https://localhost:443/x").ok).toBe(false);
    expect(checkImageFetchUrl("https://127.0.0.1/x")).toMatchObject({
      ok: false,
      reason: "ip_literal_not_allowed",
    });
    expect(checkImageFetchUrl("https://[::1]/x")).toMatchObject({
      ok: false,
      reason: "ip_literal_not_allowed",
    });
  });

  it("rejects non-https schemes", () => {
    expect(checkImageFetchUrl("http://abcd1234.supabase.co/x.jpg")).toMatchObject({
      ok: false,
      reason: "scheme_not_allowed",
    });
    expect(checkImageFetchUrl("file:///etc/passwd")).toMatchObject({
      ok: false,
      reason: "scheme_not_allowed",
    });
  });

  it("rejects embedded credentials and non-443 ports", () => {
    expect(checkImageFetchUrl("https://user:pass@abcd1234.supabase.co/x")).toMatchObject({
      ok: false,
      reason: "credentials_not_allowed",
    });
    expect(checkImageFetchUrl("https://abcd1234.supabase.co:8080/x")).toMatchObject({
      ok: false,
      reason: "port_not_allowed",
    });
  });

  it("rejects hosts outside the allowlist (incl. lookalikes)", () => {
    expect(checkImageFetchUrl("https://evil.com/x.jpg")).toMatchObject({
      ok: false,
      reason: "host_not_allowlisted",
    });
    // suffix must be a real label boundary, not a substring
    expect(checkImageFetchUrl("https://notsupabase.co/x.jpg")).toMatchObject({
      ok: false,
      reason: "host_not_allowlisted",
    });
    expect(checkImageFetchUrl("https://supabase.co.evil.com/x.jpg")).toMatchObject({
      ok: false,
      reason: "host_not_allowlisted",
    });
  });

  it("honors SSRF_ALLOWED_IMAGE_HOSTS extra suffixes", () => {
    process.env.SSRF_ALLOWED_IMAGE_HOSTS = "cdn.example.com, .imagedelivery.net";
    expect(checkImageFetchUrl("https://cdn.example.com/x.jpg").ok).toBe(true);
    expect(checkImageFetchUrl("https://foo.imagedelivery.net/x.jpg").ok).toBe(true);
    expect(checkImageFetchUrl("https://example.com/x.jpg").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(checkImageFetchUrl("not a url")).toMatchObject({ ok: false, reason: "invalid_url" });
  });

  it("assertImageFetchUrl throws SsrfBlockedError on blocked URL", () => {
    expect(() => assertImageFetchUrl("https://169.254.169.254/")).toThrow(SsrfBlockedError);
    const url = assertImageFetchUrl("https://abcd1234.supabase.co/x.jpg");
    expect(url.hostname).toBe("abcd1234.supabase.co");
  });

  it("partitionImageFetchUrls splits allowed and blocked", () => {
    const { allowed, blocked } = partitionImageFetchUrls([
      "https://abcd1234.supabase.co/a.jpg",
      "https://169.254.169.254/meta",
      "http://abcd1234.supabase.co/b.jpg",
    ]);
    expect(allowed).toEqual(["https://abcd1234.supabase.co/a.jpg"]);
    expect(blocked.map((b) => b.reason)).toEqual(["ip_literal_not_allowed", "scheme_not_allowed"]);
  });
});
