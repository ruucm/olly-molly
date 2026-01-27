'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTicket } from './SortableTicket';

interface Ticket {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    assignee_ids: string[];
    assignees: {
        id: string;
        name: string;
        avatar?: string | null;
        role: string;
        system_prompt: string;
        is_default: number;
        can_generate_images: number;
        can_log_screenshots: number;
    }[];
}

interface KanbanColumnProps {
    id: string;
    title: string;
    tickets: Ticket[];
    color: string;
    icon: string;
    onTicketClick: (ticket: Ticket) => void;
    runningTicketIds?: string[];
    selectedTicketIds?: Set<string>;
    onTicketSelect?: (ticketId: string) => void;
}

export function KanbanColumn({ id, title, tickets, color, icon, onTicketClick, runningTicketIds = [], selectedTicketIds, onTicketSelect }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`
                flex-shrink-0 w-[85vw] md:w-auto md:flex-1 md:min-w-[260px]
                flex flex-col max-h-[calc(100vh-140px)] md:max-h-[calc(100vh-180px)]
                border border-[var(--border-primary)] md:border-0 md:border-r md:last:border-r-0
                rounded-lg md:rounded-none
                bg-[var(--bg-card)] md:bg-transparent
                snap-center md:snap-align-none
                transition-colors duration-150
                ${isOver ? 'bg-[var(--bg-secondary)]' : ''}
            `}
        >
            {/* Column Header */}
            <div className="px-3 md:px-4 py-2 md:py-3 border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <h3 className={`text-xs font-medium uppercase tracking-wider ${color}`}>
                        {title}
                    </h3>
                    <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                        {tickets.length}
                    </span>
                </div>
            </div>

            {/* Tickets */}
            <div className="flex-1 overflow-y-auto p-1 md:p-0">
                <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tickets.map((ticket) => (
                        <SortableTicket
                            key={ticket.id}
                            ticket={ticket}
                            onTicketClick={onTicketClick}
                            isRunning={runningTicketIds.includes(ticket.id)}
                            isSelected={selectedTicketIds?.has(ticket.id)}
                            onSelect={onTicketSelect ? () => onTicketSelect(ticket.id) : undefined}
                        />
                    ))}
                </SortableContext>

                {tickets.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-[var(--text-muted)] text-xs">
                        No tickets
                    </div>
                )}
            </div>
        </div>
    );
}
