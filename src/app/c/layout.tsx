export default function CLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-base p-4 text-primary">{children}</main>;
}
