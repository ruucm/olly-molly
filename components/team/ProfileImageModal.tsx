'use client';

import { useEffect } from 'react';

interface ProfileImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string;
    name: string;
}

export function ProfileImageModal({ isOpen, onClose, imageSrc, name }: ProfileImageModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="relative max-w-[90vw] max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
                    aria-label="Close"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                {/* Image */}
                <img
                    src={imageSrc}
                    alt={name}
                    className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
                    onClick={(e) => e.stopPropagation()}
                />

                {/* Name caption */}
                <p className="mt-4 text-center text-white/90 text-lg font-medium">{name}</p>
            </div>
        </div>
    );
}
