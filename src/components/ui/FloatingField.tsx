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
  onBlur?: (value: string) => void;
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
    onBlur,
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
  const [reveal, setReveal] = useState(false);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const floating = focused || (current?.length ?? 0) > 0;
  const hasError = !!error;
  const isPassword = type === "password";
  const effectiveType = isPassword && reveal ? "text" : type;

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
        type={effectiveType}
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
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e.target.value);
        }}
        className={`peer block w-full bg-transparent border-0 border-b px-3 pt-4 pb-1.5 text-base text-primary placeholder:text-muted/40 focus:outline-none transition-colors ${
          isPassword ? "pr-10" : ""
        } ${hasError ? "border-red-500/60" : "border-border-default focus:border-blue-400"}`}
        style={hasError ? { animation: "field-shake 360ms ease-in-out 1" } : undefined}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? "パスワードを隠す" : "パスワードを表示"}
          aria-pressed={reveal}
          className="absolute right-2 top-[1.05rem] flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-primary transition-colors"
        >
          {reveal ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.98 8.22A10.5 10.5 0 0 0 1.5 12s3.75 7.5 10.5 7.5a9.7 9.7 0 0 0 4.02-.86M9.88 5.66A10.6 10.6 0 0 1 12 4.5c6.75 0 10.5 7.5 10.5 7.5a18 18 0 0 1-2.16 3.19M6.6 6.6 17.4 17.4M3 3l18 18"
              />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M1.5 12S5.25 4.5 12 4.5 22.5 12 22.5 12 18.75 19.5 12 19.5 1.5 12 1.5 12Z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
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
