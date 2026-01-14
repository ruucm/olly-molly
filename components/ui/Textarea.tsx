import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ label, className = "", ...props }: TextareaProps) {
  return (
    <label className="block space-y-2">
      {label ? (
        <span className="text-sm font-semibold text-[var(--ink)]">
          {label}
        </span>
      ) : null}
      <textarea
        className={`w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] ${className}`}
        {...props}
      />
    </label>
  );
}
