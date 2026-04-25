"use client";

import { forwardRef, useId, useState } from "react";

type Props = {
  label: string;
  type?: "text" | "email" | "password" | "tel";
  name?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string | null;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
};

export const FloatingField = forwardRef<HTMLInputElement, Props>(function FloatingField(
  {
    label,
    type = "text",
    name,
    required,
    defaultValue,
    value,
    onChange,
    error,
    maxLength,
    minLength,
    autoComplete,
    placeholder,
  },
  ref,
) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const floating = focused || (current?.length ?? 0) > 0;
  const hasError = !!error;

  return (
    <div className="relative pt-3 pb-5">
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-3 transition-all duration-200 ease-out ${
          floating ? "top-0 text-[0.6875rem] tracking-[0.12em] uppercase font-semibold" : "top-[1.4rem] text-sm"
        } ${hasError ? "text-red-400" : floating ? "text-blue-400" : "text-muted"}`}
      >
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={focused ? placeholder : undefined}
        defaultValue={isControlled ? undefined : defaultValue}
        value={isControlled ? value : undefined}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`peer block w-full bg-transparent border-0 border-b px-3 pt-4 pb-1.5 text-base text-primary placeholder:text-muted/40 focus:outline-none transition-colors ${
          hasError ? "border-red-500/60" : "border-border focus:border-blue-400"
        }`}
        style={hasError ? { animation: "field-shake 360ms ease-in-out 1" } : undefined}
      />
      {/* sliding underline (focus) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 right-0 bottom-5 h-[2px] origin-center transform-gpu transition-transform duration-300 ease-out ${
          hasError ? "bg-red-500/70" : "bg-blue-400"
        } ${focused ? "scale-x-100" : "scale-x-0"}`}
      />
      {/* error text */}
      <span
        className={`absolute left-3 bottom-0 text-[0.6875rem] tracking-wide text-red-400 transition-opacity duration-200 ${
          hasError ? "opacity-100" : "opacity-0"
        }`}
        aria-live="polite"
      >
        {error || ""}
      </span>
    </div>
  );
});
