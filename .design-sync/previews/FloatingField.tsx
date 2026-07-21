import { FloatingField } from "holy-cert";

export function Filled() {
  return (
    <div className="max-w-xs">
      <FloatingField label="お客様氏名" defaultValue="田中 太郎" />
    </div>
  );
}

export function ErrorState() {
  return (
    <div className="max-w-xs">
      <FloatingField label="メールアドレス" type="email" defaultValue="invalid" error="正しい形式で入力してください" />
    </div>
  );
}
