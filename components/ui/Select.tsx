'use client';

interface SelectProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    className?: string;
}

export function Select({ label, value, onChange, options, placeholder, className = '' }: SelectProps) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                    {label}
                </label>
            )}
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`
                    w-full px-3 py-2 text-sm
                    bg-transparent text-[var(--text-primary)]
                    border-b border-[var(--border-primary)]
                    transition-colors duration-150 cursor-pointer
                    focus:outline-none focus:border-[var(--text-primary)]
                    ${className}
                `}
            >
                {placeholder && (
                    <option value="" disabled className="text-[var(--text-muted)]">
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[var(--bg-card)]">
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
