'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
        const baseStyles = `
            inline-flex items-center justify-center font-medium
            transition-colors duration-150
            focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]
            disabled:opacity-40 disabled:cursor-not-allowed
        `;

        const variants = {
            primary: `
                bg-[var(--accent-primary)] text-[var(--bg-primary)]
                hover:bg-[var(--accent-secondary)]
                border border-[var(--accent-primary)]
            `,
            secondary: `
                bg-transparent text-[var(--text-primary)]
                border border-[var(--border-primary)]
                hover:border-[var(--text-primary)]
            `,
            ghost: `
                bg-transparent text-[var(--text-secondary)]
                border border-transparent
                hover:text-[var(--text-primary)]
            `,
            danger: `
                bg-transparent text-[var(--priority-high-text)]
                border border-[var(--priority-high-text)]
                hover:bg-[var(--priority-high)]
            `,
        };

        const sizes = {
            sm: 'px-3 py-1 text-xs gap-1.5',
            md: 'px-4 py-1.5 text-sm gap-2',
            lg: 'px-5 py-2 text-sm gap-2',
        };

        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
                {...props}
            >
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
