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
  // screen-reader-associated, and the error/hint message needs its own id
  // wired to the control via aria-describedby (plus aria-invalid when
  // there's an error) so assistive tech actually announces it. children is
  // a single control in every real usage of this component
  // (Input/Select/Textarea/raw <input>) — clone these in rather than
  // requiring every call site to wire them manually.
  const childProps = isValidElement(children) ? (children.props as Record<string, unknown>) : undefined;
  const existingId = childProps?.id as string | undefined;
  const controlId = existingId ?? autoId;
  const messageId = error || hint ? `${autoId}-message` : undefined;

  const cloneProps: Record<string, unknown> = {};
  if (!existingId) cloneProps.id = controlId;
  if (messageId) {
    const existingDescribedBy = childProps?.["aria-describedby"] as string | undefined;
    cloneProps["aria-describedby"] = existingDescribedBy ? `${existingDescribedBy} ${messageId}` : messageId;
  }
  if (error) cloneProps["aria-invalid"] = true;
  const control =
    isValidElement(children) && Object.keys(cloneProps).length > 0 ? cloneElement(children, cloneProps) : children;

  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={controlId} className="block text-xs text-muted">
        {label}
        {required && "（必須）"}
      </label>
      {control}
      {error ? (
        <p id={messageId} className="text-[10px] text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[10px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
