import dynamic from "next/dynamic";

const StoresClient = dynamic(() => import("./StoresClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export default function StoresPage() {
  return <StoresClient />;
}
