import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const sizes = size === "sm" ? "px-4 py-1.5 text-sm" : "px-5 py-2 text-sm";
  const variants = {
    primary: "bg-[var(--accent)] text-white hover:-translate-y-0.5",
    ghost: "border border-[var(--border)] bg-white text-[var(--ink)]",
    danger: "bg-rose-500 text-white hover:-translate-y-0.5",
  };

  return (
    <button
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
