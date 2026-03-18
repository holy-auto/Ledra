import { describe, it, expect } from "vitest";
import { escapeHtml, escapeIlike } from "../sanitize";

describe("escapeHtml", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('value="test"')).toBe("value=&quot;test&quot;");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("does not alter safe strings", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });

  it("handles Japanese text", () => {
    expect(escapeHtml("テスト<注意>")).toBe("テスト&lt;注意&gt;");
  });

  it("prevents attribute injection", () => {
    const malicious = '" onload="alert(1)';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('"');
    expect(escaped).toBe("&quot; onload=&quot;alert(1)");
  });
});

describe("escapeIlike", () => {
  it("escapes percent wildcard", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
  });

  it("escapes underscore wildcard", () => {
    expect(escapeIlike("test_value")).toBe("test\\_value");
  });

  it("escapes backslash", () => {
    expect(escapeIlike("path\\to")).toBe("path\\\\to");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeIlike("normal text")).toBe("normal text");
  });

  it("escapes combined special chars", () => {
    expect(escapeIlike("50%_off\\sale")).toBe("50\\%\\_off\\\\sale");
  });
});
