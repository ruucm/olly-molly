'use client';

import { Avatar } from '@/components/ui/Avatar';
import { PriorityBadge } from '@/components/ui/Badge';

interface Ticket {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assignee?: {
        id: string;
        name: string;
        avatar?: string | null;
        role: string;
        system_prompt: string;
        is_default: number;
        can_generate_images: number;
        can_log_screenshots: number;
    } | null;
}

interface TicketCardProps {
    ticket: Ticket;
    onClick: () => void;
    isDragging?: boolean;
    isRunning?: boolean;
}

export function TicketCard({ ticket, onClick, isDragging, isRunning }: TicketCardProps) {
    const roleImages: Record<string, string> = {
        PM: '/profiles/pm.png',
        FE_DEV: '/profiles/dev-frontend.png',
        BACKEND_DEV: '/profiles/dev-backend.png',
        QA: '/profiles/qa.png',
        BUG_HUNTER: '/profiles/dev-bughunter.jpg',
    };

    const profileImage = ticket.assignee ? roleImages[ticket.assignee.role] : undefined;

    return (
        <div
            onClick={onClick}
            className={`
                px-4 py-3 border-b border-[var(--border-primary)] cursor-pointer
                transition-colors duration-150
                hover:bg-[var(--bg-secondary)]
                ${isDragging ? 'opacity-50 bg-[var(--bg-secondary)]' : ''}
                ${isRunning ? 'bg-[var(--status-progress)]/30' : ''}
            `}
        >
            <div className="flex items-start gap-3">
                {/* Left: Assignee Avatar */}
                <div className="flex-shrink-0 pt-0.5">
                    {ticket.assignee ? (
                        <Avatar
                            name={ticket.assignee.name}
                            src={profileImage}
                            emoji={!profileImage ? ticket.assignee.avatar : undefined}
                            badge={profileImage ? ticket.assignee.avatar : undefined}
                            size="sm"
                        />
                    ) : (
                        <div className="w-6 h-6 border border-dashed border-[var(--border-secondary)] flex items-center justify-center text-[var(--text-muted)] text-xs">
                            ?
                        </div>
                    )}
                </div>

                {/* Right: Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm text-[var(--text-primary)] line-clamp-2 leading-snug">
                            {isRunning && (
                                <span className="inline-block w-1.5 h-1.5 bg-[var(--status-progress-text)] rounded-full gentle-pulse mr-1.5 align-middle" />
                            )}
                            {ticket.title}
                        </h4>
                        <PriorityBadge priority={ticket.priority} />
                    </div>

                    {ticket.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">
                            {ticket.description}
                        </p>
                    )}

                    {(ticket.assignee || isRunning) && (
                        <p className="text-xs text-[var(--text-muted)] mt-1.5">
                            {isRunning ? (
                                <span className="text-[var(--status-progress-text)]">Working...</span>
                            ) : (
                                ticket.assignee?.name
                            )}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
