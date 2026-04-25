import { describe, it, expect } from "vitest";
import { buildCsp, buildCspHeader, serializeCsp } from "../csp";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

describe("buildCsp", () => {
  it("includes the nonce in script-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["script-src"]).toContain(`'nonce-${NONCE}'`);
    expect(csp["script-src"]).toContain("'self'");
  });

  it("does NOT include 'unsafe-inline' in script-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("does NOT include 'unsafe-eval' in production", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("DOES include 'unsafe-eval' in development for Next.js HMR", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: true });
    expect(csp["script-src"]).toContain("'unsafe-eval'");
  });

  it("locks frame-ancestors to 'none' (clickjacking prevention)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("disables legacy plugins via object-src 'none'", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["media-src"]).toEqual(["'none'"]);
  });

  it("limits form-action to 'self' (form-jacking prevention)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("limits base-uri to 'self' (base-tag injection prevention)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });

  it("explicit worker-src 'self' (so the SW does not fall back to script-src)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["worker-src"]).toContain("'self'");
  });

  it("allows PostHog telemetry endpoints in connect-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["connect-src"]).toContain("https://*.posthog.com");
  });

  it("allows Stripe.js in script-src and frame-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["script-src"]).toContain("https://js.stripe.com");
    expect(csp["frame-src"]).toContain("https://js.stripe.com");
    expect(csp["frame-src"]).toContain("https://hooks.stripe.com");
    expect(csp["connect-src"]).toContain("https://api.stripe.com");
  });

  it("allows Supabase in img-src and connect-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["img-src"]).toContain("https://*.supabase.co");
    expect(csp["connect-src"]).toContain("https://*.supabase.co");
  });

  it("allows Sentry telemetry in connect-src", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["connect-src"]).toContain("https://*.sentry.io");
    expect(csp["connect-src"]).toContain("https://*.ingest.sentry.io");
  });

  it("allows jsdelivr fonts only via font-src (not script-src)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["font-src"]).toContain("https://cdn.jsdelivr.net");
    expect(csp["script-src"]).not.toContain("https://cdn.jsdelivr.net");
  });

  it("allows api.qrserver.com only via img-src (not connect-src)", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["img-src"]).toContain("https://api.qrserver.com");
    expect(csp["connect-src"]).not.toContain("https://api.qrserver.com");
  });

  it("allows blob: and data: in img-src for client-side image work", () => {
    const csp = buildCsp({ nonce: NONCE, isDev: false });
    expect(csp["img-src"]).toContain("blob:");
    expect(csp["img-src"]).toContain("data:");
  });
});

describe("serializeCsp", () => {
  it("joins directives with '; '", () => {
    const out = serializeCsp({
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://example.com"],
    });
    expect(out).toBe("default-src 'self'; script-src 'self' https://example.com");
  });
});

describe("buildCspHeader", () => {
  it("produces a single header string", () => {
    const header = buildCspHeader({ nonce: NONCE, isDev: false });
    expect(typeof header).toBe("string");
    expect(header.split(";").length).toBeGreaterThan(10);
    expect(header).toContain(`'nonce-${NONCE}'`);
    expect(header).toContain("frame-ancestors 'none'");
  });

  it("differs between dev and prod", () => {
    const dev = buildCspHeader({ nonce: NONCE, isDev: true });
    const prod = buildCspHeader({ nonce: NONCE, isDev: false });
    expect(dev).not.toBe(prod);
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });
});
