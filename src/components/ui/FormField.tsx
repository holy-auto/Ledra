import { cloneElement, isValidElement, useId, type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export default function FormField({ label, required = false, hint, error, children, className = "" }: FormFieldProps) {
  const autoId = useId();
  // The label needs a real htmlFor/id pairing to be clickable and
  // screen-reader-associated. children is a single control in every real
  // usage of this component (Input/Select/Textarea/raw <input>) — clone in
  // an id when the control doesn't already declare its own, rather than
  // requiring every call site to pass and wire one manually.
  const existingId = isValidElement(children) ? (children.props as { id?: string }).id : undefined;
  const controlId = existingId ?? autoId;
  const control =
    isValidElement(children) && !existingId ? cloneElement(children, { id: controlId } as { id: string }) : children;

  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={controlId} className="block text-xs text-muted">
        {label}
        {required && "（必須）"}
      </label>
      {control}
      {error ? (
        <p className="text-[10px] text-danger-text">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
