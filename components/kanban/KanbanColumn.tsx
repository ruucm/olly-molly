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

interface KanbanColumnProps {
    id: string;
    title: string;
    tickets: Ticket[];
    color: string;
    icon: string;
    onTicketClick: (ticket: Ticket) => void;
    runningTicketIds?: string[];
}

export function KanbanColumn({ id, title, tickets, color, icon, onTicketClick, runningTicketIds = [] }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`
                flex-1 min-w-[260px]
                flex flex-col max-h-[calc(100vh-180px)]
                border-r border-[var(--border-primary)] last:border-r-0
                transition-colors duration-150
                ${isOver ? 'bg-[var(--bg-secondary)]' : 'bg-transparent'}
            `}
        >
            {/* Column Header */}
            <div className="px-4 py-3 border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <h3 className={`text-xs font-medium uppercase tracking-wider ${color}`}>
                        {title}
                    </h3>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                        {tickets.length}
                    </span>
                </div>
            </div>

            {/* Tickets */}
            <div className="flex-1 overflow-y-auto">
                <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tickets.map((ticket) => (
                        <SortableTicket
                            key={ticket.id}
                            ticket={ticket}
                            onTicketClick={onTicketClick}
                            isRunning={runningTicketIds.includes(ticket.id)}
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
