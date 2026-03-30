import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {error && (
        <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 16 }}>
          {error === "empty"
            ? "メールアドレスとパスワードを入力してください。"
            : "メールアドレスまたはパスワードが正しくありません。"}
        </p>
      )}
      <LoginForm />
    </main>
  );
}
