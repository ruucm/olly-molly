'use client';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
    size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
    const variants = {
        default: 'text-[var(--text-tertiary)] bg-transparent border-[var(--border-primary)]',
        success: 'text-[var(--status-done-text)] bg-transparent border-[var(--status-done-text)]/30',
        warning: 'text-[var(--priority-medium-text)] bg-transparent border-[var(--priority-medium-text)]/30',
        danger: 'text-[var(--priority-high-text)] bg-transparent border-[var(--priority-high-text)]/30',
        info: 'text-[var(--status-progress-text)] bg-transparent border-[var(--status-progress-text)]/30',
        purple: 'text-[var(--status-review-text)] bg-transparent border-[var(--status-review-text)]/30',
    };

    const sizes = {
        sm: 'px-1.5 py-0.5 text-[10px]',
        md: 'px-2 py-0.5 text-xs',
    };

    return (
        <span className={`
            inline-flex items-center font-medium border uppercase tracking-wide
            ${variants[variant]} ${sizes[size]}
        `}>
            {children}
        </span>
    );
}

// Status-specific badge
export function StatusBadge({ status }: { status: string }) {
    const statusConfig: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
        TODO: { label: 'Todo', variant: 'default' },
        IN_PROGRESS: { label: 'Progress', variant: 'info' },
        IN_REVIEW: { label: 'Review', variant: 'purple' },
        COMPLETE: { label: 'Done', variant: 'success' },
        ON_HOLD: { label: 'Hold', variant: 'warning' },
    };

    const config = statusConfig[status] || { label: status, variant: 'default' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
}

// Priority badge
export function PriorityBadge({ priority }: { priority: string }) {
    const priorityConfig: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
        LOW: { label: 'Low', variant: 'default' },
        MEDIUM: { label: 'Med', variant: 'warning' },
        HIGH: { label: 'High', variant: 'danger' },
        CRITICAL: { label: '!', variant: 'danger' },
    };

    const config = priorityConfig[priority] || { label: priority, variant: 'default' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
}
