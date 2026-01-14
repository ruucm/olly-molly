'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | 'full';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
        full: 'max-w-none w-full h-full rounded-none',
    };

    return (
        <div
            ref={overlayRef}
            className={`fixed inset-0 z-50 flex items-center justify-center animate-in fade-in ${size === 'full' ? 'p-0' : 'p-4'}`}
            onClick={(e) => e.target === overlayRef.current && onClose()}
        >
            {/* Minimal backdrop */}
            <div className="absolute inset-0 bg-[var(--bg-primary)]/90" />

            {/* Modal container */}
            <div className={`
                relative w-full ${sizes[size]} 
                bg-[var(--bg-card)] 
                border border-[var(--border-primary)]
                animate-in zoom-in-95
                flex flex-col
                ${size === 'full' ? 'max-h-none overflow-hidden' : 'max-h-[calc(100vh-4rem)] overflow-y-auto'}
            `}>
                {title && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
                        <h2 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wide">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
                <div className={size === 'full' ? 'p-0 flex-1 min-h-0' : 'p-6'}>{children}</div>
            </div>
        </div>
    );
}
