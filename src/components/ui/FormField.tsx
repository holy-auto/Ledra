import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export default function FormField({ label, required = false, hint, error, children, className = "" }: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="text-xs text-muted">
        {label}
        {required && "（必須）"}
      </div>
      {children}
      {error ? (
        <p className="text-[10px] text-danger-text">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
