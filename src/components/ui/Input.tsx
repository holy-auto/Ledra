import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ error, className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`input-field ${error ? "is-error" : ""} ${className}`}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});

Input.displayName = "Input";
export default Input;
