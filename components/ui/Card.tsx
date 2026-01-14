'use client';

import { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    hoverable?: boolean;
    variant?: 'default' | 'bordered' | 'flat';
}

export function Card({
    children,
    className = '',
    onClick,
    hoverable = false,
    variant = 'default'
}: CardProps) {
    const variants = {
        default: `bg-[var(--bg-card)] border-b border-[var(--border-primary)]`,
        bordered: `bg-[var(--bg-card)] border border-[var(--border-primary)]`,
        flat: `bg-transparent`,
    };

    const hoverStyles = hoverable ? `
        hover:bg-[var(--bg-secondary)]
        cursor-pointer 
        transition-colors duration-150
    ` : '';

    return (
        <div
            className={`${variants[variant]} ${hoverStyles} ${className}`}
            onClick={onClick}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`px-4 py-3 border-b border-[var(--border-primary)] ${className}`}>
            {children}
        </div>
    );
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`p-4 ${className}`}>
            {children}
        </div>
    );
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`px-4 py-3 border-t border-[var(--border-primary)] ${className}`}>
            {children}
        </div>
    );
}
