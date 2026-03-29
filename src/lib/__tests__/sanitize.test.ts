import { describe, it, expect } from "vitest";
import { escapeHtml, escapeIlike, escapePostgrestValue } from "../sanitize";

// ─── escapeHtml ───
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

  it("escapes multiple ampersands in sequence", () => {
    expect(escapeHtml("&&&&")).toBe("&amp;&amp;&amp;&amp;");
  });

  it("handles mixed HTML entities in realistic content", () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("handles unicode emoji safely", () => {
    expect(escapeHtml("Hello 🎉 <world>")).toBe("Hello 🎉 &lt;world&gt;");
  });

  it("handles newlines and whitespace (no escaping needed)", () => {
    expect(escapeHtml("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });
});

// ─── escapeIlike ───
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

  it("handles empty string", () => {
    expect(escapeIlike("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(escapeIlike("%_%\\")).toBe("\\%\\_\\%\\\\");
  });

  it("handles multiple consecutive percent signs", () => {
    expect(escapeIlike("%%%")).toBe("\\%\\%\\%");
  });

  it("handles multiple consecutive underscores", () => {
    expect(escapeIlike("___")).toBe("\\_\\_\\_");
  });

  it("handles multiple consecutive backslashes", () => {
    expect(escapeIlike("\\\\")).toBe("\\\\\\\\");
  });

  it("preserves unicode characters", () => {
    expect(escapeIlike("テスト%検索")).toBe("テスト\\%検索");
  });

  it("handles realistic ILIKE injection attempt", () => {
    // User tries to search for everything with %
    const input = "%' OR 1=1 --";
    const escaped = escapeIlike(input);
    expect(escaped).toBe("\\%' OR 1=1 --");
    expect(escaped.startsWith("%")).toBe(false);
  });
});

// ─── escapePostgrestValue ───
describe("escapePostgrestValue", () => {
  it("removes commas", () => {
    expect(escapePostgrestValue("a,b,c")).toBe("abc");
  });

  it("removes parentheses", () => {
    expect(escapePostgrestValue("value(test)")).toBe("valuetest");
  });

  it("removes mixed metacharacters", () => {
    expect(escapePostgrestValue("foo(bar),baz")).toBe("foobarbaz");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapePostgrestValue("normal text")).toBe("normal text");
  });

  it("handles empty string", () => {
    expect(escapePostgrestValue("")).toBe("");
  });

  it("preserves dots and other non-metacharacters", () => {
    expect(escapePostgrestValue("test.value")).toBe("test.value");
  });

  it("preserves spaces", () => {
    expect(escapePostgrestValue("hello world")).toBe("hello world");
  });

  it("strips PostgREST filter injection attempt", () => {
    // Attempt to inject a PostgREST .or() condition
    const malicious = "value),name.eq.admin,(id.eq.1";
    const escaped = escapePostgrestValue(malicious);
    expect(escaped).not.toContain(",");
    expect(escaped).not.toContain("(");
    expect(escaped).not.toContain(")");
    expect(escaped).toBe("valuename.eq.adminid.eq.1");
  });

  it("handles unicode characters", () => {
    expect(escapePostgrestValue("テスト(注意)")).toBe("テスト注意");
  });

  it("handles string with only metacharacters", () => {
    expect(escapePostgrestValue(",()")).toBe("");
  });

  it("handles nested parentheses", () => {
    expect(escapePostgrestValue("((nested))")).toBe("nested");
  });
});
