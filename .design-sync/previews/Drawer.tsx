import { Drawer, FormField, Input, Select, Button } from "holy-cert";

export function Default() {
  // See Modal.tsx for why the minHeight wrapper is needed for fixed-overlay
  // single-mode previews. ponytail: 560 is hand-picked, not derived from
  // cfg.overrides.Drawer.viewport (480x600) — keep the two in sync by hand
  // if either changes; see Modal.tsx for the upgrade path.
  return (
    <div style={{ minHeight: 560 }}>
      <Drawer open onClose={() => {}} title="車両情報を編集">
        <div className="space-y-4">
          <FormField label="車両登録番号" required>
            <Input defaultValue="品川 300 あ 12-34" />
          </FormField>
          <FormField label="車種">
            <Select
              defaultValue="sedan"
              options={[
                { value: "sedan", label: "セダン" },
                { value: "suv", label: "SUV" },
                { value: "kei", label: "軽自動車" },
              ]}
            />
          </FormField>
          <Button variant="primary">保存する</Button>
        </div>
      </Drawer>
    </div>
  );
}
