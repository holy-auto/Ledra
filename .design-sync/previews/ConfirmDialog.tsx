import { ConfirmDialog } from "holy-cert";

export function Danger() {
  return (
    <div style={{ minHeight: 420 }}>
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="この証明書を削除しますか？"
        description="削除すると復元できません。関連する写真・署名データもすべて削除されます。"
        variant="danger"
        confirmLabel="削除する"
      />
    </div>
  );
}

export function Default() {
  return (
    <div style={{ minHeight: 420 }}>
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="下書きを保存しますか？"
        description="現在の入力内容を下書きとして保存します。"
      />
    </div>
  );
}
