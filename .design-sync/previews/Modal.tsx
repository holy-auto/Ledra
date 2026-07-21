import { Modal, Button } from "holy-cert";

export function Default() {
  // The capture harness mounts single-mode stories inside a `transform`-ed
  // wrapper (so `position: fixed` overlays render inside the card instead of
  // escaping to the page) — but that wrapper has no other in-flow content of
  // its own, so it collapses to 0 height and Modal's fixed/inset-0 backdrop
  // centers against nothing. A sized sibling div gives it real height to
  // center against.
  //
  // ponytail: minHeight is a hand-picked value, not derived from anything —
  // it isn't tied to cfg.overrides.Modal.viewport in .design-sync/config.json
  // (currently 640x560), so growing this preview's content or changing that
  // viewport can silently under-size the wrapper again with no error, just a
  // mis-centered/clipped screenshot. Upgrade path: measure rendered content
  // height and size the wrapper to match, or fix the capture harness to give
  // single-mode wrappers a real height itself.
  return (
    <div style={{ minHeight: 480 }}>
      <Modal
        open
        onClose={() => {}}
        title="証明書を発行しますか？"
        footer={
          <>
            <Button variant="secondary">キャンセル</Button>
            <Button variant="primary">発行する</Button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          施工内容・写真・署名が確定します。発行後は編集できません。内容を確認のうえ、発行してください。
        </p>
      </Modal>
    </div>
  );
}
