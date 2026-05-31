import dynamic from "next/dynamic";

const MessagesInboxClient = dynamic(() => import("./MessagesInboxClient"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  ),
});

export const revalidate = 0;

export const metadata = {
  title: "メッセージ受信箱 | Ledra",
};

export default function Page() {
  return <MessagesInboxClient />;
}
