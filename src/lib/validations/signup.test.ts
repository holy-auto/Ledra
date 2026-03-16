import { describe, it, expect } from "vitest";
import { signupSchema } from "./signup";

describe("signupSchema", () => {
  const validInput = {
    email: "test@example.com",
    password: "password123",
    shop_name: "テスト施工店",
    display_name: "山田太郎",
    contact_phone: "03-1234-5678",
  };

  it("正常な入力を受け付ける", () => {
    const result = signupSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
      expect(result.data.shop_name).toBe("テスト施工店");
    }
  });

  it("メールを小文字に正規化する", () => {
    const result = signupSchema.safeParse({ ...validInput, email: "TEST@EXAMPLE.COM" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
    }
  });

  it("メールの前後空白をトリムする", () => {
    const result = signupSchema.safeParse({ ...validInput, email: "  test@example.com  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
    }
  });

  // ─── バリデーションエラー ───
  describe("バリデーションエラー", () => {
    it("メール空欄は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, email: "" });
      expect(result.success).toBe(false);
    });

    it("不正なメール形式は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, email: "not-an-email" });
      expect(result.success).toBe(false);
    });

    it("パスワード7文字は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, password: "1234567" });
      expect(result.success).toBe(false);
    });

    it("パスワード8文字は許可", () => {
      const result = signupSchema.safeParse({ ...validInput, password: "12345678" });
      expect(result.success).toBe(true);
    });

    it("パスワード129文字は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, password: "a".repeat(129) });
      expect(result.success).toBe(false);
    });

    it("店舗名空欄は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, shop_name: "" });
      expect(result.success).toBe(false);
    });

    it("店舗名101文字は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, shop_name: "あ".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("店舗名100文字は許可", () => {
      const result = signupSchema.safeParse({ ...validInput, shop_name: "あ".repeat(100) });
      expect(result.success).toBe(true);
    });
  });

  // ─── オプショナルフィールド ───
  describe("オプショナルフィールド", () => {
    it("display_nameは省略可能", () => {
      const { display_name, ...rest } = validInput;
      const result = signupSchema.safeParse(rest);
      expect(result.success).toBe(true);
    });

    it("空文字のdisplay_nameはnullに変換される", () => {
      const result = signupSchema.safeParse({ ...validInput, display_name: "" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.display_name).toBeNull();
      }
    });

    it("contact_phoneは省略可能", () => {
      const { contact_phone, ...rest } = validInput;
      const result = signupSchema.safeParse(rest);
      expect(result.success).toBe(true);
    });

    it("空文字のcontact_phoneはnullに変換される", () => {
      const result = signupSchema.safeParse({ ...validInput, contact_phone: "" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contact_phone).toBeNull();
      }
    });

    it("電話番号21文字は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, contact_phone: "1".repeat(21) });
      expect(result.success).toBe(false);
    });

    it("担当者名51文字は拒否", () => {
      const result = signupSchema.safeParse({ ...validInput, display_name: "あ".repeat(51) });
      expect(result.success).toBe(false);
    });
  });

  // ─── 複数エラー ───
  describe("複数エラー", () => {
    it("全フィールド不正の場合、複数のエラーが返る", () => {
      const result = signupSchema.safeParse({
        email: "",
        password: "short",
        shop_name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
