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

    // body overflow 처리 - isOpen만 의존
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Escape 키 처리 - 별도 effect로 분리
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Desktop sizes
    const sizes = {
        sm: 'md:max-w-sm',
        md: 'md:max-w-md',
        lg: 'md:max-w-lg',
        xl: 'md:max-w-xl',
        '2xl': 'md:max-w-2xl',
        '4xl': 'md:max-w-4xl',
        full: 'max-w-none w-full h-full rounded-none',
    };

    const isFullSize = size === 'full';

    return (
        <div
            ref={overlayRef}
            className={`fixed inset-0 z-50 flex items-center justify-center animate-in fade-in ${isFullSize ? 'p-0' : 'p-0 md:p-4'}`}
            onClick={(e) => e.target === overlayRef.current && onClose()}
        >
            {/* Minimal backdrop */}
            <div className="absolute inset-0 bg-[var(--bg-primary)]/90" />

            {/* Modal container - Full screen on mobile, sized on desktop */}
            <div className={`
                relative w-full ${sizes[size]}
                bg-[var(--bg-card)]
                border-0 md:border border-[var(--border-primary)]
                animate-in zoom-in-95
                flex flex-col
                ${isFullSize
                    ? 'max-h-none h-full overflow-hidden rounded-none'
                    : 'max-h-screen md:max-h-[calc(100vh-4rem)] h-full md:h-auto md:rounded-lg overflow-hidden'
                }
            `}>
                {title && (
                    <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border-primary)] shrink-0">
                        <h2 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wide truncate">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-2 -mr-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors touch-target"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
                <div className={`
                    ${isFullSize ? 'p-0 flex-1 min-h-0' : 'p-4 md:p-6 flex-1 overflow-y-auto'}
                `}>{children}</div>
            </div>
        </div>
    );
}
