import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ error, className = "", ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`input-field resize-y ${error ? "is-error" : ""} ${className}`}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
export default Textarea;
