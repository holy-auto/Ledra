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
});
