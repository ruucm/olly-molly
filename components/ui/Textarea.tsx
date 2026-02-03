'use client';

import { TextareaHTMLAttributes, forwardRef, useEffect, useRef, useCallback } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    autoResize?: boolean;
    minRows?: number;
    maxRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className = '', label, error, autoResize = false, minRows = 2, maxRows = 10, onChange, ...props }, ref) => {
        const internalRef = useRef<HTMLTextAreaElement>(null);
        const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

        const adjustHeight = useCallback(() => {
            const textarea = textareaRef.current;
            if (!textarea || !autoResize) return;

            textarea.style.height = 'auto';
            const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
            const paddingTop = parseInt(getComputedStyle(textarea).paddingTop) || 8;
            const paddingBottom = parseInt(getComputedStyle(textarea).paddingBottom) || 8;
            const minHeight = lineHeight * minRows + paddingTop + paddingBottom;
            const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;
            const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
            textarea.style.height = `${newHeight}px`;
        }, [autoResize, minRows, maxRows, textareaRef]);

        useEffect(() => {
            adjustHeight();
        }, [props.value, adjustHeight]);

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange?.(e);
            if (autoResize) {
                adjustHeight();
            }
        };

        return (
            <div className="w-full">
                {label && (
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                        {label}
                    </label>
                )}
                <textarea
                    ref={textareaRef}
                    className={`
                        w-full px-3 py-2 text-sm
                        bg-transparent text-[var(--text-primary)]
                        border border-[var(--border-primary)]
                        placeholder:text-[var(--text-muted)]
                        transition-colors duration-150 resize-none
                        focus:outline-none focus:border-[var(--text-primary)]
                        ${error ? 'border-[var(--priority-high-text)]' : ''}
                        ${autoResize ? 'overflow-hidden' : ''}
                        ${className}
                    `}
                    onChange={handleChange}
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
