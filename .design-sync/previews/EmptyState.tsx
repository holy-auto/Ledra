import { EmptyState, Button } from "holy-cert";

const DocIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
    <path d="M14 3v5h5" strokeLinejoin="round" />
  </svg>
);

export function Default() {
  return (
    <EmptyState
      icon={DocIcon}
      title="証明書がまだありません"
      description="施工が完了したら、証明書を発行できます。"
      action={<Button variant="primary">証明書を発行</Button>}
    />
  );
}

export function Minimal() {
  return <EmptyState title="検索結果がありません" description="別のキーワードでお試しください。" />;
}
