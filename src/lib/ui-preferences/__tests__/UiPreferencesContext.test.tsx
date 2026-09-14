/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DisplayModeOnboarding from "@/app/admin/DisplayModeOnboarding";
import { UiPreferencesProvider, useUiPreferences } from "../UiPreferencesContext";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

function PreferenceHarness() {
  const preferences = useUiPreferences();
  const [error, setError] = useState("");

  return (
    <>
      <output data-testid="mode">{preferences.displayMode}</output>
      <output data-testid="override">{preferences.deviceOverride ?? "none"}</output>
      <output data-testid="loading">{String(preferences.loading)}</output>
      <output data-testid="error">{error}</output>
      <button
        type="button"
        onClick={() => {
          void preferences.setDisplayMode("simple", "account").catch(() => setError("failed"));
        }}
      >
        共通設定を保存
      </button>
      <button type="button" onClick={() => void preferences.completeOnboarding("simple")}>
        初回設定を完了
      </button>
    </>
  );
}

function OnboardingHarness() {
  const { restartOnboarding } = useUiPreferences();

  return (
    <>
      <DisplayModeOnboarding />
      <button type="button" onClick={() => void restartOnboarding()}>
        選び方をやり直す
      </button>
    </>
  );
}

describe("UiPreferencesProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("共通設定の保存に失敗しても端末限定設定を保持する", async () => {
    window.localStorage.setItem("ledra.displayMode.device", "dense");
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ ok: true, displayMode: "standard", onboardingCompleted: true }))
      .mockImplementationOnce(() => jsonResponse({ ok: false }, false));

    render(
      <UiPreferencesProvider>
        <PreferenceHarness />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("mode").textContent).toBe("dense");

    await act(async () => screen.getByRole("button", { name: "共通設定を保存" }).click());

    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("failed"));
    expect(screen.getByTestId("mode").textContent).toBe("dense");
    expect(screen.getByTestId("override").textContent).toBe("dense");
    expect(window.localStorage.getItem("ledra.displayMode.device")).toBe("dense");
  });

  it("初回設定の完了時に古い端末限定設定を解除する", async () => {
    window.localStorage.setItem("ledra.displayMode.device", "dense");
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ ok: true, displayMode: "standard", onboardingCompleted: false }))
      .mockImplementationOnce(() => jsonResponse({ ok: true, displayMode: "simple", onboardingCompleted: true }));

    render(
      <UiPreferencesProvider>
        <PreferenceHarness />
      </UiPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await act(async () => screen.getByRole("button", { name: "初回設定を完了" }).click());

    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("simple"));
    expect(screen.getByTestId("override").textContent).toBe("none");
    expect(window.localStorage.getItem("ledra.displayMode.device")).toBeNull();
  });

  it("選び方をやり直すと最初の質問から再開する", async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ ok: true, displayMode: "standard", onboardingCompleted: false }))
      .mockImplementation(() => jsonResponse({ ok: true, displayMode: "simple", onboardingCompleted: true }));

    render(
      <UiPreferencesProvider>
        <OnboardingHarness />
      </UiPreferencesProvider>,
    );

    await screen.findByRole("heading", { name: "主に担当する仕事を教えてください" });
    fireEvent.click(screen.getByRole("button", { name: "施工・作業" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByRole("heading", { name: "見やすい表示を選びます" });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByRole("heading", { name: "この表示で始めます" });
    fireEvent.click(screen.getByRole("button", { name: "この表示で始める" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "選び方をやり直す" }));

    await screen.findByRole("heading", { name: "主に担当する仕事を教えてください" });
  });
});
