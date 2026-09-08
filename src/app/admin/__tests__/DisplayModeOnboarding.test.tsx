/** @vitest-environment jsdom */

import { act, fireEvent, within } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DisplayModeOnboarding from "../DisplayModeOnboarding";

/**
 * 開閉に伴う入力の初期化を固定する。
 *
 * 初期化は以前 useEffect でやっていたが、レンダー中に判定する形へ移した
 * （理由はコンポーネント側のコメント）。**この移設でリセットが効かなくなって
 * いないこと**をここで押さえる。リセットを消す変異で下のテストは落ちる。
 *
 * 注意: CI で落ちた「選択が消える」競合そのものは、ここでは再現できていない。
 * flushSync で commit だけ進めても passive effect は保留にならず、旧実装でも
 * 同じように通ってしまう。競合を捉えるテストは書けていないので、
 * **移設の正しさはテストではなく構造（画面に出る前に初期化を終える）に依る。**
 */
const mockPreferences = vi.hoisted(() => ({
  value: {
    displayMode: "standard" as const,
    deviceOverride: null,
    loading: true,
    onboardingCompleted: false,
    setDisplayMode: vi.fn(),
    clearDeviceOverride: vi.fn(),
    completeOnboarding: vi.fn(),
    restartOnboarding: vi.fn(),
  },
}));

vi.mock("@/lib/ui-preferences/UiPreferencesContext", () => ({
  useUiPreferences: () => mockPreferences.value,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const q = () => within(container!);

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount());
    container.remove();
  }
  root = null;
  container = null;
  mockPreferences.value = { ...mockPreferences.value, loading: true, onboardingCompleted: false };
});

describe("DisplayModeOnboarding", () => {
  it("閉じてから開き直すと入力が初期化される", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockPreferences.value = { ...mockPreferences.value, loading: false };
    await act(async () => {
      root!.render(<DisplayModeOnboarding />);
    });

    // 選択すると表示に ✓ が付いてアクセシブル名が変わるので、以降は要素参照で見る。
    const technician = q().getByRole("button", { name: "施工・作業" });
    fireEvent.click(technician);
    expect(technician.getAttribute("aria-pressed")).toBe("true");

    // 完了扱いにして閉じる。
    mockPreferences.value = { ...mockPreferences.value, onboardingCompleted: true };
    await act(async () => {
      root!.render(<DisplayModeOnboarding />);
    });
    expect(container.querySelector("[role=dialog]")).toBeNull();

    // やり直しで開き直すと、前回の選択は残っていない。
    mockPreferences.value = { ...mockPreferences.value, onboardingCompleted: false };
    await act(async () => {
      root!.render(<DisplayModeOnboarding />);
    });
    expect(q().getByRole("button", { name: "施工・作業" }).getAttribute("aria-pressed")).toBe("false");
    expect((q().getByRole("button", { name: "次へ" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
