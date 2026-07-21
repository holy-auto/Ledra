import { FormField, Input, Select, Textarea } from "holy-cert";

export function TextInput() {
  return (
    <FormField label="車両登録番号" required>
      <Input placeholder="品川 300 あ 12-34" />
    </FormField>
  );
}

export function WithHint() {
  return (
    <FormField label="お客様メールアドレス" hint="証明書発行完了時の通知先に使用します">
      <Input type="email" placeholder="tanaka@example.com" />
    </FormField>
  );
}

export function WithError() {
  return (
    <FormField label="走行距離（km）" required error="数値を入力してください">
      <Input defaultValue="不明" />
    </FormField>
  );
}

export function SelectField() {
  return (
    <FormField label="施工メニュー" required>
      <Select
        placeholder="選択してください"
        options={[
          { value: "coating", label: "ボディコーティング" },
          { value: "ppf", label: "PPF（プロテクションフィルム）" },
          { value: "repaint", label: "鈑金塗装" },
        ]}
      />
    </FormField>
  );
}

export function TextareaField() {
  return (
    <FormField label="施工メモ" hint="保険会社への提出書類に転記されます">
      <Textarea rows={3} placeholder="施工内容の詳細を記入してください" />
    </FormField>
  );
}
