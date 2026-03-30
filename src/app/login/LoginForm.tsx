import { loginAction } from "./actions";

export default function LoginForm() {
  return (
    <form action={loginAction} style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>Ledra ログイン</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 16,
          }}
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "#0071e3",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ログイン
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <a href="/forgot-password" style={{ fontSize: 12, color: "#0071e3" }}>
          パスワードをお忘れですか？
        </a>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>
          アカウントをお持ちでないですか？{" "}
          <a href="/signup" style={{ color: "#0071e3" }}>
            新規登録
          </a>
        </p>
      </div>
    </form>
  );
}
