'use client';

import { Avatar } from '@/components/ui/Avatar';
import { PriorityBadge } from '@/components/ui/Badge';

interface Member {
    id: string;
    name: string;
    avatar?: string | null;
    role: string;
    system_prompt: string;
    is_default: number;
    can_generate_images: number;
    can_log_screenshots: number;
}

interface Ticket {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assignee_ids: string[];
    assignees: Member[];  // Multi-assignee support
}

interface TicketCardProps {
    ticket: Ticket;
    onClick: () => void;
    isDragging?: boolean;
    isRunning?: boolean;
    isSelected?: boolean;
    onSelect?: (e: React.MouseEvent) => void;
}

export function TicketCard({ ticket, onClick, isDragging, isRunning, isSelected, onSelect }: TicketCardProps) {
    const roleImages: Record<string, string> = {
        PM: '/profiles/pm.png',
        FE_DEV: '/profiles/dev-frontend.png',
        BACKEND_DEV: '/profiles/dev-backend.png',
        QA: '/profiles/qa.png',
        BUG_HUNTER: '/profiles/dev-bughunter.jpg',
    };

    const assignees = ticket.assignees || [];
    const displayAssignees = assignees.slice(0, 3);
    const remainingCount = assignees.length - 3;

    return (
        <div
            onClick={onClick}
            className={`
                px-4 py-3 border-b border-[var(--border-primary)] cursor-pointer
                transition-colors duration-150
                hover:bg-[var(--bg-secondary)]
                ${isDragging ? 'opacity-50 bg-[var(--bg-secondary)]' : ''}
                ${isRunning ? 'bg-[var(--status-progress)]/30' : ''}
                ${isSelected ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''}
            `}
        >
            <div className="flex items-start gap-3">
                {/* Selection Checkbox - only rendered when selection mode is active */}
                {onSelect && (
                    <div className="flex-shrink-0 pt-0.5">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(e);
                            }}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected
                                ? 'bg-indigo-500 border-indigo-500 text-white'
                                : 'border-[var(--border-secondary)] hover:border-indigo-400'
                                }`}
                        >
                            {isSelected && (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}

                {/* Left: Assignee Avatars (stacked) */}
                <div className="flex-shrink-0 pt-0.5">
                    {assignees.length > 0 ? (
                        <div className="flex -space-x-2">
                            {displayAssignees.map((assignee, index) => {
                                const profileImage = roleImages[assignee.role];
                                return (
                                    <div
                                        key={assignee.id}
                                        className="relative"
                                        style={{ zIndex: displayAssignees.length - index }}
                                    >
                                        <Avatar
                                            name={assignee.name}
                                            src={profileImage}
                                            emoji={!profileImage ? assignee.avatar : undefined}
                                            badge={profileImage ? assignee.avatar : undefined}
                                            size="sm"
                                        />
                                    </div>
                                );
                            })}
                            {remainingCount > 0 && (
                                <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                                    +{remainingCount}
                                </div>
                            )}
                        </div>
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

                    {(assignees.length > 0 || isRunning) && (
                        <p className="text-xs text-[var(--text-muted)] mt-1.5">
                            {isRunning ? (
                                <span className="text-[var(--status-progress-text)]">Working...</span>
                            ) : (
                                assignees.map(a => a.name).join(', ')
                            )}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
