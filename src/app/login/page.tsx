"use client";

import dynamic from "next/dynamic";

const LoginForm = dynamic(() => import("./LoginForm"), { ssr: false });

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <LoginForm />
    </main>
  );
}
