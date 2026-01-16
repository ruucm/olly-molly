'use client';

import { useState, useRef, useEffect } from 'react';

interface MultiSelectProps {
    label?: string;
    values: string[];
    onChange: (values: string[]) => void;
    options: { value: string; label: string; avatar?: string }[];
    placeholder?: string;
    className?: string;
}

export function MultiSelect({ label, values, onChange, options, placeholder = 'Select...', className = '' }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (optionValue: string) => {
        if (values.includes(optionValue)) {
            onChange(values.filter(v => v !== optionValue));
        } else {
            onChange([...values, optionValue]);
        }
    };

    const selectedLabels = options
        .filter(opt => values.includes(opt.value))
        .map(opt => opt.avatar ? `${opt.avatar} ${opt.label}` : opt.label);

    const displayValue = selectedLabels.length > 0
        ? selectedLabels.length <= 2
            ? selectedLabels.join(', ')
            : `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`
        : placeholder;

    return (
        <div className={`w-full relative ${className}`} ref={containerRef}>
            {label && (
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                    {label}
                </label>
            )}

            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full px-3 py-2 text-sm text-left
                    bg-transparent text-[var(--text-primary)]
                    border-b border-[var(--border-primary)]
                    transition-colors duration-150 cursor-pointer
                    focus:outline-none focus:border-[var(--text-primary)]
                    flex items-center justify-between gap-2
                    ${values.length === 0 ? 'text-[var(--text-muted)]' : ''}
                `}
            >
                <span className="truncate">{displayValue}</span>
                <svg
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {options.map((option) => (
                        <label
                            key={option.value}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={values.includes(option.value)}
                                onChange={() => toggleOption(option.value)}
                                className="w-4 h-4 rounded border-[var(--border-secondary)] bg-transparent text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                            />
                            <span className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                                {option.avatar && <span>{option.avatar}</span>}
                                {option.label}
                            </span>
                            {values.includes(option.value) && (
                                <span className="ml-auto text-indigo-400">✓</span>
                            )}
                        </label>
                    ))}
                    {options.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
                            No options available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
