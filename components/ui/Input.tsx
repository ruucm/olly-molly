'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', label, error, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={`
                        w-full px-3 py-2 text-sm
                        bg-transparent text-[var(--text-primary)]
                        border-b border-[var(--border-primary)]
                        placeholder:text-[var(--text-muted)] 
                        transition-colors duration-150
                        focus:outline-none focus:border-[var(--text-primary)]
                        ${error ? 'border-[var(--priority-high-text)]' : ''}
                        ${className}
                    `}
                    {...props}
                />
                {error && (
                    <p className="mt-1 text-xs text-[var(--priority-high-text)]">{error}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
