import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildInboundAddress,
  parseInboundToken,
  extractAddresses,
  firstAddress,
  displayName,
  parseMessageId,
} from "@/lib/email/inboundAddress";

const DOMAIN = "parse.example.com";

describe("inboundAddress", () => {
  beforeEach(() => {
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN;
  });
  afterEach(() => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
  });

  it("builds and round-trips a token", () => {
    const addr = buildInboundAddress("abc123");
    expect(addr).toBe(`yoyaku-abc123@${DOMAIN}`);
    expect(parseInboundToken(addr)).toBe("abc123");
  });

  it("returns null address when domain is unset", () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    expect(buildInboundAddress("abc123")).toBeNull();
    expect(parseInboundToken(`yoyaku-abc123@${DOMAIN}`)).toBeNull();
  });

  it("resolves the token from a multi-recipient To header, display names and all", () => {
    const to = `"Shop" <other@example.com>, 予約 <yoyaku-tok9@${DOMAIN}>`;
    expect(parseInboundToken(to)).toBe("tok9");
  });

  it("prefers envelope array recipients", () => {
    expect(parseInboundToken([`someoneelse@${DOMAIN}0`, `yoyaku-envtok@${DOMAIN}`])).toBe("envtok");
  });

  it("tolerates plus-addressing on the local part", () => {
    expect(parseInboundToken(`yoyaku-tok9+gmail@${DOMAIN}`)).toBe("tok9");
  });

  it("ignores addresses on other domains and non-yoyaku locals", () => {
    expect(parseInboundToken(`yoyaku-tok9@evil.example.net`)).toBeNull();
    expect(parseInboundToken(`hello@${DOMAIN}`)).toBeNull();
    expect(parseInboundToken("")).toBeNull();
  });

  it("extracts addresses, first sender, and display name from a From header", () => {
    expect(extractAddresses(`"山田 太郎" <taro@example.com>`)).toEqual(["taro@example.com"]);
    expect(firstAddress(`山田 太郎 <taro@example.com>`)).toBe("taro@example.com");
    expect(displayName(`"山田 太郎" <taro@example.com>`)).toBe("山田 太郎");
    expect(displayName("taro@example.com")).toBeNull();
  });

  it("parses Message-ID from raw headers case-insensitively", () => {
    const headers = "From: a@b\r\nMessage-ID: <abc@mail.example.com>\r\nSubject: hi";
    expect(parseMessageId(headers)).toBe("<abc@mail.example.com>");
    expect(parseMessageId("no id here")).toBeNull();
  });
});
