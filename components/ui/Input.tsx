import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <label className="block space-y-2">
      {label ? (
        <span className="text-sm font-semibold text-[var(--ink)]">
          {label}
        </span>
      ) : null}
      <input
        className={`w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] ${className}`}
        {...props}
      />
    </label>
  );
}
