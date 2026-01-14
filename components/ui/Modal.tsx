"use client";

import type { ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: "md" | "lg";
  children: ReactNode;
};

export function Modal({
  isOpen,
  onClose,
  title,
  size = "md",
  children,
}: ModalProps) {
  if (!isOpen) return null;

  const maxWidth = size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-10">
      <div
        className={`w-full ${maxWidth} rounded-3xl border border-[var(--border)] bg-[var(--paper)] p-6 shadow-xl`}
      >
        <div className="flex items-center justify-between">
          {title ? (
            <h3 className="text-xl font-semibold text-[var(--ink)]">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <button
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
