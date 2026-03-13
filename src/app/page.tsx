import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-6">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ background: "linear-gradient(135deg, #0071e3, #5856d6)" }}>
          C
        </div>
        <span className="text-2xl font-bold tracking-wider text-primary">CARTRUST</span>
      </div>

      <p className="text-secondary text-center max-w-md mb-10">
        WEB施工証明書SaaS — 車両の施工証明書をデジタルで発行・管理するプラットフォーム
      </p>

      {/* Login links */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        <Link href="/login" className="btn-primary flex-1 text-center">
          管理者ログイン
        </Link>
        <Link href="/insurer/login" className="btn-secondary flex-1 text-center">
          保険会社ログイン
        </Link>
      </div>

      <p className="mt-12 text-xs text-muted">HOLY-CERT v1.0</p>
    </div>
  );
}
