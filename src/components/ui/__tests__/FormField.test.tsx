// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormField from "../FormField";

describe("FormField", () => {
  it("associates the label with an auto-generated id when the control has none", () => {
    render(
      <FormField label="お名前">
        <input type="text" />
      </FormField>,
    );
    const input = screen.getByLabelText("お名前");
    expect(input).toBeInstanceOf(HTMLInputElement);
  });

  it("respects an id the control already declares", () => {
    render(
      <FormField label="電話番号">
        <input type="tel" id="phone-field" />
      </FormField>,
    );
    const input = screen.getByLabelText("電話番号");
    expect(input.id).toBe("phone-field");
  });

  it("associates an error message with the control via aria-describedby and marks it invalid", () => {
    render(
      <FormField label="お名前" error="必須項目です">
        <input type="text" />
      </FormField>,
    );
    const input = screen.getByLabelText("お名前") as HTMLInputElement;
    const message = screen.getByText("必須項目です");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("associates a hint message with the control without marking it invalid", () => {
    render(
      <FormField label="お名前" hint="全角で入力してください">
        <input type="text" />
      </FormField>,
    );
    const input = screen.getByLabelText("お名前") as HTMLInputElement;
    const message = screen.getByText("全角で入力してください");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("preserves a describedby id the control already declares alongside the message id", () => {
    render(
      <FormField label="お名前" error="必須項目です">
        <input type="text" aria-describedby="other-help-text" />
      </FormField>,
    );
    const input = screen.getByLabelText("お名前") as HTMLInputElement;
    const message = screen.getByText("必須項目です");
    const describedBy = input.getAttribute("aria-describedby")?.split(" ");
    expect(describedBy).toEqual(["other-help-text", message.id]);
  });
});
