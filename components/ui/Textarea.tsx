'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className = '', label, error, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                        {label}
                    </label>
                )}
                <textarea
                    ref={ref}
                    className={`
                        w-full px-3 py-2 text-sm
                        bg-transparent text-[var(--text-primary)]
                        border border-[var(--border-primary)]
                        placeholder:text-[var(--text-muted)] 
                        transition-colors duration-150 resize-none
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

Textarea.displayName = 'Textarea';
